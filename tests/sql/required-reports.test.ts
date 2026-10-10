import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let daniel: string;
let grace: string;
let target: { initiative: string; assignment: string; name: string; submitter: string; other: string };

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  daniel = await userId(owner, "daniel.cho");
  grace = await userId(owner, "grace.chen");
  const row = (
    await owner.query(
      `SELECT i.id AS initiative, a.id AS assignment, i.name, u.id AS submitter,
              (SELECT i2.id FROM initiative i2 JOIN assignment a2 ON a2.initiative_id = i2.id
                WHERE a2.org_id = a.org_id AND i2.fiscal_year_id = i.fiscal_year_id AND i2.id <> i.id LIMIT 1) AS other
       FROM assignment a
       JOIN app_user u ON u.org_id = a.org_id AND u.role = 'cbo_submitter' AND u.active
       JOIN initiative i ON i.id = a.initiative_id
       WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM submission s JOIN assignment a3 ON a3.id = s.assignment_id WHERE a3.initiative_id = i.id)
         AND EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')
       ORDER BY i.code LIMIT 1`,
    )
  ).rows[0];
  target = row;
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

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

async function claims(id: string) {
  await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id })]);
}

async function periodsSeenBy(who: string, initiative: string): Promise<string[]> {
  await claims(who);
  const { rows } = await app.query<{ period_id: string }>(
    "SELECT DISTINCT period_id, due_on FROM obligation WHERE initiative_id = $1 ORDER BY due_on, period_id",
    [initiative],
  );
  return rows.map((r) => r.period_id);
}

describe("[US-002] an initiative requires the reports its administrator chooses", () => {
  it("keeps the seeded behavior as the default: every initiative requires both standard periods of its year", async () => {
    expect(target.initiative).toBeTruthy();
    const { rows } = await owner.query<{ fiscal_year_id: string; periods: number; initiatives: number }>(
      `SELECT i.fiscal_year_id, count(DISTINCT o.period_id)::int AS periods, count(DISTINCT i.id)::int AS initiatives
       FROM initiative i JOIN obligation o ON o.initiative_id = i.id GROUP BY 1 ORDER BY 1`,
    );
    for (const row of rows) expect(row.periods).toBe(2);
    expect((await owner.query("SELECT count(*)::int AS n FROM initiative_period_exclusion")).rows[0].n).toBe(0);
    expect(
      (await owner.query("SELECT count(*)::int AS n FROM reporting_period WHERE initiative_id IS NOT NULL")).rows[0].n,
    ).toBe(0);
  });

  it("lets an administrator remove a standard period, and the organization then sees only the reports still required", async () => {
    await asUser(app, priya, async () => {
      expect(await periodsSeenBy(priya, target.initiative)).toEqual(["FY27-MY", "FY27-YE"]);
      await app.query("SELECT app.set_required_period($1, 'FY27-YE', false)", [target.initiative]);
      expect(await periodsSeenBy(priya, target.initiative)).toEqual(["FY27-MY"]);
      expect(await periodsSeenBy(target.submitter, target.initiative)).toEqual(["FY27-MY"]);
      if (target.other) expect(await periodsSeenBy(target.submitter, target.other)).toEqual(["FY27-MY", "FY27-YE"]);
      await claims(priya);
      const audit = (
        await app.query(
          "SELECT actor_id, note, before FROM audit_event WHERE entity = 'initiative' AND entity_id = $1 AND action = 'required_report_removed'",
          [target.initiative],
        )
      ).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].actor_id).toBe(priya);
      expect(audit[0].before.period_id).toBe("FY27-YE");
    });
  });

  it("brings a removed period back and records that too", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.set_required_period($1, 'FY27-MY', false)", [target.initiative]);
      await app.query("SELECT app.set_required_period($1, 'FY27-MY', true)", [target.initiative]);
      expect(await periodsSeenBy(priya, target.initiative)).toEqual(["FY27-MY", "FY27-YE"]);
      const actions = (
        await app.query("SELECT action FROM audit_event WHERE entity_id = $1 ORDER BY id", [target.initiative])
      ).rows.map((r) => r.action);
      expect(actions).toEqual(["required_report_removed", "required_report_added"]);
    });
  });

  it("refuses to start a report for a period the initiative does not require", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.set_required_period($1, 'FY27-YE', false)", [target.initiative]);
      await claims(target.submitter);
      const code = await errorCode(() =>
        app.query(
          `INSERT INTO submission (reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
           SELECT 'TEST-EXCL-1', $1, 'FY27-YE', f.id, 'draft', app.uid(), app.uid()
           FROM form_version f WHERE f.initiative_id = $2 AND f.status = 'published'`,
          [target.assignment, target.initiative],
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it("keeps a report that was already started: it cannot be removed", async () => {
    await asUser(app, priya, async () => {
      await claims(target.submitter);
      await app.query(
        `INSERT INTO submission (reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
         SELECT 'TEST-START-1', $1, 'FY27-MY', f.id, 'draft', app.uid(), app.uid()
         FROM form_version f WHERE f.initiative_id = $2 AND f.status = 'published'`,
        [target.assignment, target.initiative],
      );
      await claims(priya);
      expect(
        await errorCode(() => app.query("SELECT app.set_required_period($1, 'FY27-MY', false)", [target.initiative])),
      ).toBe("23514");
    });
  });

  it("never leaves an initiative with no required report", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.set_required_period($1, 'FY27-MY', false)", [target.initiative]);
      const code = await errorCode(() =>
        app.query("SELECT app.set_required_period($1, 'FY27-YE', false)", [target.initiative]),
      );
      expect(code).toBe("23514");
    });
  });

  it("only changes periods of the initiative's own fiscal year", async () => {
    await asUser(app, priya, async () => {
      expect(
        await errorCode(() => app.query("SELECT app.set_required_period($1, 'FY26-MY', false)", [target.initiative])),
      ).toBe("23514");
    });
  });

  it("is limited to administrators: analysts, view-only staff and organizations are refused", async () => {
    for (const who of [daniel, grace, target.submitter]) {
      await asUser(app, who, async () => {
        expect(
          await errorCode(() => app.query("SELECT app.set_required_period($1, 'FY27-YE', false)", [target.initiative])),
        ).toBe("42501");
        expect(
          await errorCode(() =>
            app.query("SELECT app.add_custom_report($1, 'Audit report', NULL, NULL, '2027-03-31')", [
              target.initiative,
            ]),
          ),
        ).toBe("42501");
        expect(
          await errorCode(() =>
            app.query("INSERT INTO initiative_period_exclusion (initiative_id, period_id) VALUES ($1, 'FY27-YE')", [
              target.initiative,
            ]),
          ),
        ).toBe("42501");
      });
    }
  });
});

describe("[US-002] a custom-named report with its own due date", () => {
  it("adds a report for one initiative only, visible to its organizations with the chosen name and due date", async () => {
    await asUser(app, priya, async () => {
      const id = (
        await app.query("SELECT app.add_custom_report($1, 'Spring Site Audit', NULL, NULL, '2027-03-31') AS id", [
          target.initiative,
        ])
      ).rows[0].id as string;
      expect(id).toMatch(/^FY27-X[0-9A-F]{8}$/);
      expect(await periodsSeenBy(target.submitter, target.initiative)).toEqual(["FY27-MY", id, "FY27-YE"]);
      const seen = (
        await app.query(
          "SELECT p.label, p.due_on::text AS due, p.starts_on::text AS starts, p.ends_on::text AS ends FROM obligation o JOIN reporting_period p ON p.id = o.period_id WHERE o.period_id = $1 AND o.initiative_id = $2",
          [id, target.initiative],
        )
      ).rows;
      expect(seen).toEqual([
        { label: "Spring Site Audit", due: "2027-03-31", starts: "2026-07-01", ends: "2027-03-31" },
      ]);
      if (target.other) expect(await periodsSeenBy(target.submitter, target.other)).toEqual(["FY27-MY", "FY27-YE"]);
      expect((await app.query("SELECT count(*)::int AS n FROM obligation WHERE period_id = $1", [id])).rows[0].n).toBe(
        (await app.query("SELECT count(*)::int AS n FROM assignment WHERE initiative_id = $1", [target.initiative]))
          .rows[0].n,
      );
      await claims(priya);
      const rules = (await app.query("SELECT count(*)::int AS n FROM reminder_rule WHERE period_id = $1", [id])).rows[0]
        .n;
      expect(rules).toBe(4);
      const calendar = (
        await app.query("SELECT id FROM app.public_calendar('2026-10-14') WHERE kind = 'period'")
      ).rows.map((r) => r.id);
      expect(calendar).not.toContain(id);
      const audit = (
        await app.query("SELECT note FROM audit_event WHERE entity_id = $1 AND action = 'custom_report_added'", [
          target.initiative,
        ])
      ).rows;
      expect(audit).toEqual([{ note: "Spring Site Audit" }]);
    });
  });

  it("lets the organization start the custom report, and keeps it from other initiatives' organizations", async () => {
    await asUser(app, priya, async () => {
      const id = (
        await app.query("SELECT app.add_custom_report($1, 'Spring Site Audit', NULL, NULL, '2027-03-31') AS id", [
          target.initiative,
        ])
      ).rows[0].id as string;
      await claims(target.submitter);
      expect(
        await errorCode(() =>
          app.query(
            `INSERT INTO submission (reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
             SELECT 'TEST-CUSTOM-1', $1, $3, f.id, 'draft', app.uid(), app.uid()
             FROM form_version f WHERE f.initiative_id = $2 AND f.status = 'published'`,
            [target.assignment, target.initiative, id],
          ),
        ),
      ).toBeNull();
      if (target.other) {
        const otherAssignment = (await app.query("SELECT id FROM assignment WHERE initiative_id = $1", [target.other]))
          .rows[0].id;
        expect(
          await errorCode(() =>
            app.query(
              `INSERT INTO submission (reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
               SELECT 'TEST-CUSTOM-2', $1, $3, f.id, 'draft', app.uid(), app.uid()
               FROM form_version f WHERE f.initiative_id = $2 AND f.status = 'published'`,
              [otherAssignment, target.other, id],
            ),
          ),
        ).toBe("23514");
      }
    });
  });

  it("validates the name and the dates, refuses a duplicate name and removes a custom report with no reports started", async () => {
    await asUser(app, priya, async () => {
      const add = (label: string, due: string, starts: string | null = null, ends: string | null = null) =>
        errorCode(() =>
          app.query("SELECT app.add_custom_report($1, $2, $3::date, $4::date, $5::date)", [
            target.initiative,
            label,
            starts,
            ends,
            due,
          ]),
        );
      expect(await add("  ", "2027-03-31")).toBe("23514");
      expect(await add("Bad dates", "2027-03-31", "2027-02-01", "2027-01-01")).toBe("23514");
      expect(await add("Due too soon", "2027-01-01", "2026-07-01", "2027-02-01")).toBe("23514");
      expect(await add("FY27 Mid-Year", "2027-03-31")).toBe("23505");
      expect(await add("Spring Site Audit", "2027-03-31")).toBeNull();
      expect(await add("Spring Site Audit", "2027-04-30")).toBe("23505");
      const id = (await app.query("SELECT id FROM reporting_period WHERE initiative_id = $1", [target.initiative]))
        .rows[0].id;
      await app.query("SELECT app.remove_custom_report($1, $2)", [target.initiative, id]);
      expect((await app.query("SELECT count(*)::int AS n FROM reporting_period WHERE id = $1", [id])).rows[0].n).toBe(
        0,
      );
      expect(
        (await app.query("SELECT count(*)::int AS n FROM reminder_rule WHERE period_id = $1", [id])).rows[0].n,
      ).toBe(0);
    });
  });
});
