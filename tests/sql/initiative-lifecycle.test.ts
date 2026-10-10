import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { changeHistory, lineageFor } from "@/lib/lifecycle/rollover";
import type { Tx } from "@/lib/db";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let daniel: string;
let grace: string;
let target: {
  id: string;
  name: string;
  code: string;
  submitter: string;
  assignment: string;
  submitted: number;
  free_period: string;
};

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  daniel = await userId(owner, "daniel.cho");
  grace = await userId(owner, "grace.chen");
  target = (
    await owner.query(
      `SELECT i.id, i.name, i.code, u.id AS submitter, a.id AS assignment,
              (SELECT count(*)::int FROM submission s JOIN assignment a2 ON a2.id = s.assignment_id WHERE a2.initiative_id = i.id) AS submitted,
              (SELECT p.id FROM reporting_period p WHERE p.fiscal_year_id = 'FY27' AND p.initiative_id IS NULL
                 AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = p.id) ORDER BY p.id LIMIT 1) AS free_period
       FROM initiative i
       JOIN assignment a ON a.initiative_id = i.id
       JOIN app_user u ON u.org_id = a.org_id AND u.role = 'cbo_submitter' AND u.active
       WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active'
         AND EXISTS (SELECT 1 FROM submission s JOIN assignment a2 ON a2.id = s.assignment_id WHERE a2.initiative_id = i.id)
         AND EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')
         AND NOT EXISTS (SELECT 1 FROM initiative_lineage l WHERE l.predecessor_id = i.id)
         AND EXISTS (SELECT 1 FROM reporting_period p WHERE p.fiscal_year_id = 'FY27' AND p.initiative_id IS NULL
                       AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = p.id))
       ORDER BY i.code LIMIT 1`,
    )
  ).rows[0];
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function claims(id: string) {
  await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id })]);
}

async function errorCode(fn: () => Promise<unknown>): Promise<string | null> {
  await app.query("SAVEPOINT attempt");
  try {
    await fn();
    await app.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await app.query("ROLLBACK TO SAVEPOINT attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

function tx(): Tx {
  return {
    async query(sql, params) {
      return (await app.query(sql, params as unknown[])).rows;
    },
    async one(sql, params) {
      return (await app.query(sql, params as unknown[])).rows[0] ?? null;
    },
  };
}

describe("[US-011] an initiative can be renamed without losing its history", () => {
  it("renames it in place, keeps its code, awards and reports, and records the old name and the reason", async () => {
    await asUser(app, priya, async () => {
      const before = (
        await app.query("SELECT (SELECT count(*)::int FROM assignment WHERE initiative_id = $1) AS awards", [target.id])
      ).rows[0].awards;
      await app.query(
        "SELECT app.rename_initiative($1, 'Renamed Youth Pathways', 'The program was renamed by the sponsor')",
        [target.id],
      );
      const row = (await app.query("SELECT name, code, status FROM initiative WHERE id = $1", [target.id])).rows[0];
      expect(row).toEqual({ name: "Renamed Youth Pathways", code: target.code, status: "active" });
      expect(
        (await app.query("SELECT count(*)::int AS n FROM assignment WHERE initiative_id = $1", [target.id])).rows[0].n,
      ).toBe(before);
      const submitted = (
        await app.query(
          "SELECT count(*)::int AS n FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE a.initiative_id = $1",
          [target.id],
        )
      ).rows[0].n;
      expect(submitted).toBe(target.submitted);

      const lineage = (
        await app.query(
          "SELECT kind, predecessor_id, successor_id, note, created_by FROM initiative_lineage WHERE predecessor_id = $1",
          [target.id],
        )
      ).rows;
      expect(lineage).toHaveLength(1);
      expect(lineage[0].kind).toBe("renamed");
      expect(lineage[0].successor_id).toBe(target.id);
      expect(lineage[0].created_by).toBe(priya);
      expect(lineage[0].note).toBe(
        `Renamed from ${target.name} to Renamed Youth Pathways. Reason: The program was renamed by the sponsor`,
      );
      const audit = (
        await app.query(
          "SELECT actor_id, before, after, note FROM audit_event WHERE entity = 'initiative' AND entity_id = $1 AND action = 'rename'",
          [target.id],
        )
      ).rows[0];
      expect(audit.actor_id).toBe(priya);
      expect(audit.before).toEqual({ name: target.name });
      expect(audit.after).toEqual({ name: "Renamed Youth Pathways" });
      expect(audit.note).toBe("The program was renamed by the sponsor");

      const history = await changeHistory(tx(), target.id);
      expect(history.map((h) => h.kind)).toEqual(["renamed"]);
      const links = await lineageFor(tx(), target.id);
      expect(links.predecessors.map((p) => p.kind)).toEqual(["carried"]);
      expect(links.successors).toEqual([]);
    });
  });

  it("[US-012] can be renamed again, and the rename does not stop the initiative being carried into the next year", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.rename_initiative($1, 'First New Name', 'Sponsor request')", [target.id]);
      await app.query("SELECT app.rename_initiative($1, 'Second New Name', 'Second sponsor request')", [target.id]);
      expect((await changeHistory(tx(), target.id)).map((h) => h.kind)).toEqual(["renamed", "renamed"]);
      const summary = (
        await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb) AS s", [
          JSON.stringify([{ initiative_id: target.id, action: "carry" }]),
        ])
      ).rows[0].s;
      expect(summary.carried).toBeGreaterThanOrEqual(1);
      const next = (
        await app.query(
          `SELECT i.id, i.name FROM initiative i JOIN initiative_lineage l ON l.successor_id = i.id
           WHERE l.predecessor_id = $1 AND l.kind = 'carried'`,
          [target.id],
        )
      ).rows;
      expect(next).toHaveLength(1);
      expect(next[0].name).toBe("Second New Name");
      const links = await lineageFor(tx(), target.id);
      expect(links.successors.map((s) => s.kind)).toEqual(["carried"]);
      const carriedForward = await lineageFor(tx(), next[0].id);
      expect(carriedForward.predecessors.map((p) => p.other_id)).toEqual([target.id]);
    });
  });

  it("requires a reason and a new name, refuses a name already used that year and a retired initiative", async () => {
    await asUser(app, priya, async () => {
      expect(
        await errorCode(() => app.query("SELECT app.rename_initiative($1, 'Another Name', '  ')", [target.id])),
      ).toBe("23514");
      expect(await errorCode(() => app.query("SELECT app.rename_initiative($1, '  ', 'Reason')", [target.id]))).toBe(
        "23514",
      );
      expect(
        await errorCode(() => app.query("SELECT app.rename_initiative($1, $2, 'Reason')", [target.id, target.name])),
      ).toBe("23514");
      const taken = (
        await app.query("SELECT name FROM initiative WHERE fiscal_year_id = 'FY27' AND id <> $1 LIMIT 1", [target.id])
      ).rows[0].name;
      expect(
        await errorCode(() => app.query("SELECT app.rename_initiative($1, $2, 'Reason')", [target.id, taken])),
      ).toBe("23505");
      await app.query("SELECT app.retire_initiative($1, 'Ended', '2026-10-14')", [target.id]);
      expect(
        await errorCode(() => app.query("SELECT app.rename_initiative($1, 'Late Rename', 'Reason')", [target.id])),
      ).toBe("23514");
    });
  });
});

describe("[US-011] an initiative can be retired, blocking new reports and keeping history", () => {
  it("retires it with a reason, records the lineage and audit, and keeps every report already submitted", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.retire_initiative($1, 'The sponsor ended the program', '2026-10-14')", [target.id]);
      const row = (
        await app.query("SELECT status, retired_on::text AS on, retired_reason FROM initiative WHERE id = $1", [
          target.id,
        ])
      ).rows[0];
      expect(row).toEqual({ status: "retired", on: "2026-10-14", retired_reason: "The sponsor ended the program" });
      const lineage = (
        await app.query(
          "SELECT kind, successor_id, note, fiscal_year_id FROM initiative_lineage WHERE predecessor_id = $1 AND kind = 'retired'",
          [target.id],
        )
      ).rows;
      expect(lineage).toEqual([
        {
          kind: "retired",
          successor_id: null,
          note: "Retired. Reason: The sponsor ended the program",
          fiscal_year_id: "FY27",
        },
      ]);
      const audit = (
        await app.query("SELECT actor_id, before, after FROM audit_event WHERE entity_id = $1 AND action = 'retire'", [
          target.id,
        ])
      ).rows[0];
      expect(audit.actor_id).toBe(priya);
      expect(audit.before.status).toBe("active");
      expect(audit.after.status).toBe("retired");
      const kept = (
        await app.query(
          "SELECT count(*)::int AS n FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE a.initiative_id = $1",
          [target.id],
        )
      ).rows[0].n;
      expect(kept).toBe(target.submitted);
      const obligations = (
        await app.query(
          "SELECT count(*) FILTER (WHERE submission_id IS NULL)::int AS open, count(*)::int AS total FROM obligation WHERE initiative_id = $1",
          [target.id],
        )
      ).rows[0];
      expect(obligations.open).toBe(0);
      expect(obligations.total).toBe(target.submitted);
    });
  });

  it("blocks new reports for the retired initiative in the database", async () => {
    await asUser(app, priya, async () => {
      const start = () =>
        app.query(
          `INSERT INTO submission (reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
           SELECT 'TEST-RETIRED-1', $1, $2, f.id, 'draft', app.uid(), app.uid()
           FROM form_version f WHERE f.initiative_id = $3 AND f.status = 'published'`,
          [target.assignment, target.free_period, target.id],
        );
      await claims(target.submitter);
      await app.query("SAVEPOINT control");
      expect(await errorCode(start)).toBeNull();
      await app.query("ROLLBACK TO SAVEPOINT control");
      await claims(priya);
      await app.query("SELECT app.retire_initiative($1, 'Ended', '2026-10-14')", [target.id]);
      await claims(target.submitter);
      expect(await errorCode(start)).toBe("23514");
      expect(
        (
          await app.query(
            "SELECT count(*)::int AS n FROM obligation WHERE initiative_id = $1 AND submission_id IS NULL",
            [target.id],
          )
        ).rows[0].n,
      ).toBe(0);
    });
  });

  it("does not carry a retired initiative into the next year and cannot be retired twice", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.retire_initiative($1, 'Ended', '2026-10-14')", [target.id]);
      expect(
        await errorCode(() => app.query("SELECT app.retire_initiative($1, 'Again', '2026-10-15')", [target.id])),
      ).toBe("23514");
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb)", [JSON.stringify([])]);
      const carried = (
        await app.query(
          "SELECT count(*)::int AS n FROM initiative_lineage WHERE predecessor_id = $1 AND kind <> 'retired'",
          [target.id],
        )
      ).rows[0].n;
      expect(carried).toBe(0);
    });
  });

  it("requires a reason", async () => {
    await asUser(app, priya, async () => {
      expect(
        await errorCode(() => app.query("SELECT app.retire_initiative($1, '   ', '2026-10-14')", [target.id])),
      ).toBe("23514");
    });
  });
});

describe("[US-011] only an administrator can rename or retire", () => {
  it("refuses analysts, view-only staff and organizations", async () => {
    for (const who of [daniel, grace, target.submitter]) {
      await asUser(app, who, async () => {
        expect(
          await errorCode(() => app.query("SELECT app.rename_initiative($1, 'Sneaky', 'Reason')", [target.id])),
        ).toBe("42501");
        expect(
          await errorCode(() => app.query("SELECT app.retire_initiative($1, 'Reason', '2026-10-14')", [target.id])),
        ).toBe("42501");
        expect(
          await errorCode(() =>
            app.query(
              "INSERT INTO initiative_lineage (predecessor_id, successor_id, kind, fiscal_year_id) VALUES ($1, NULL, 'retired', 'FY27')",
              [target.id],
            ),
          ),
        ).not.toBeNull();
        expect(
          await errorCode(() => app.query("UPDATE initiative SET status = 'retired' WHERE id = $1", [target.id])),
        ).not.toBeNull();
      });
    }
    expect((await owner.query("SELECT status, name FROM initiative WHERE id = $1", [target.id])).rows[0]).toEqual({
      status: "active",
      name: target.name,
    });
  });
});
