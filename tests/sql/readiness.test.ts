import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import { loadReadiness } from "@/lib/ops/readiness";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let daniel: string;
let maria: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  daniel = await userId(owner, "daniel.cho");
  maria = await userId(owner, "maria.santos");
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function code(fn: () => Promise<unknown>): Promise<string | null> {
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

const tx: Tx = {
  async query(sql, params) {
    return (await app.query(sql, params)).rows;
  },
  async one(sql, params) {
    return (await app.query(sql, params)).rows[0] ?? null;
  },
};

const today = "(now() AT TIME ZONE 'America/New_York')::date";

describe("[US-065] user acceptance test sessions", () => {
  it("records a session with its scenario, tester, result and defects, and audits it", async () => {
    await asUser(app, priya, async () => {
      const id = (
        await app.query(
          `SELECT app.record_uat_session(${today}, 'Organization adds a second submitter', 'Maria Santos', 'Program Director', 'failed', 'Invite email arrived after ten minutes.',
             '[{"description":"Invite email is delayed","severity":"major"},{"description":"Invite link wording is unclear","severity":"minor"}]'::jsonb) AS id`,
        )
      ).rows[0].id as string;
      const session = (
        await app.query("SELECT scenario, tester_name, tester_role, result FROM uat_session WHERE id = $1", [id])
      ).rows[0];
      expect(session).toEqual({
        scenario: "Organization adds a second submitter",
        tester_name: "Maria Santos",
        tester_role: "Program Director",
        result: "failed",
      });
      const defects = (
        await app.query(
          "SELECT description, severity, status FROM uat_defect WHERE session_id = $1 ORDER BY description",
          [id],
        )
      ).rows;
      expect(defects).toEqual([
        { description: "Invite email is delayed", severity: "major", status: "open" },
        { description: "Invite link wording is unclear", severity: "minor", status: "open" },
      ]);
      const audit = (
        await app.query("SELECT action FROM audit_event WHERE entity = 'uat_session' AND entity_id = $1", [id])
      ).rows;
      expect(audit).toEqual([{ action: "uat_recorded" }]);
    });
  });

  it("rejects a passed session that lists defects, a future date and a bad result", async () => {
    await asUser(app, priya, async () => {
      expect(
        await code(() =>
          app.query(
            `SELECT app.record_uat_session(${today}, 'S', 'T', 'R', 'passed', NULL, '[{"description":"x","severity":"minor"}]'::jsonb)`,
          ),
        ),
      ).toBe("23514");
      expect(
        await code(() =>
          app.query(`SELECT app.record_uat_session(${today} + 2, 'S', 'T', 'R', 'passed', NULL, '[]'::jsonb)`),
        ),
      ).toBe("23514");
      expect(
        await code(() =>
          app.query(`SELECT app.record_uat_session(${today}, 'S', 'T', 'R', 'maybe', NULL, '[]'::jsonb)`),
        ),
      ).toBe("23514");
      expect(
        await code(() =>
          app.query(
            `SELECT app.record_uat_session(${today}, 'S', 'T', 'R', 'failed', NULL, '[{"description":"x","severity":"huge"}]'::jsonb)`,
          ),
        ),
      ).toBe("23514");
    });
  });

  it("marks a defect fixed once, with a date inside the session-to-today window", async () => {
    await asUser(app, priya, async () => {
      await app.query(
        `SELECT app.record_uat_session(${today} - 3, 'Organization uploads a large file', 'Maria Santos', 'Program Director', 'failed', NULL,
           '[{"description":"Progress bar does not clear","severity":"major"}]'::jsonb)`,
      );
      const open = (
        await app.query(
          "SELECT d.id, s.session_on::text AS on FROM uat_defect d JOIN uat_session s ON s.id = d.session_id WHERE d.status = 'open' ORDER BY d.created_at LIMIT 1",
        )
      ).rows[0];
      expect(await code(() => app.query("SELECT app.fix_uat_defect($1, $2::date - 1)", [open.id, open.on]))).toBe(
        "23514",
      );
      expect(await code(() => app.query(`SELECT app.fix_uat_defect($1, ${today} + 1)`, [open.id]))).toBe("23514");
      await app.query(`SELECT app.fix_uat_defect($1, ${today})`, [open.id]);
      const fixed = (
        await app.query("SELECT status, fixed_on IS NOT NULL AS dated FROM uat_defect WHERE id = $1", [open.id])
      ).rows[0];
      expect(fixed).toEqual({ status: "fixed", dated: true });
    });
  });

  it("is limited to administrators and hidden from other roles", async () => {
    await asUser(app, daniel, async () => {
      expect(
        await code(() =>
          app.query(`SELECT app.record_uat_session(${today}, 'S', 'T', 'R', 'passed', NULL, '[]'::jsonb)`),
        ),
      ).toBe("42501");
      expect((await app.query("SELECT count(*)::int AS n FROM uat_session")).rows[0].n).toBe(0);
    });
    await asUser(app, maria, async () => {
      expect((await app.query("SELECT count(*)::int AS n FROM training_record")).rows[0].n).toBe(0);
    });
  });
});

describe("[US-066] training records and the readiness summary", () => {
  it("starts with nothing held, then reports the trained share and the pass rate from the records on file", async () => {
    await asUser(app, priya, async () => {
      const empty = await loadReadiness(tx);
      expect(empty.users.length).toBe(17);
      expect(empty.training).toEqual({ users: 17, trained: 0, percent: 0 });
      expect(empty.uat).toEqual({ scenarios: 0, passed: 0, percent: null });
      expect(empty.sessions).toEqual([]);
      expect(empty.schedule.length).toBeGreaterThan(0);
      expect(empty.schedule.every((s) => s.scheduled_on >= "2026-11-30")).toBe(true);

      const analyst = empty.users.find((u) => u.role === "finance_analyst")!;
      for (const mod of empty.modules.filter((m) => m.audience.includes(analyst.role)))
        await app.query(`SELECT app.record_training($1, $2, ${today})`, [analyst.id, mod.key]);
      await app.query(`SELECT app.record_uat_session(${today}, 'Scenario A', 'T', 'R', 'passed', NULL, '[]'::jsonb)`);
      await app.query(
        `SELECT app.record_uat_session(${today}, 'Scenario B', 'T', 'R', 'failed', NULL, '[{"description":"x","severity":"minor"}]'::jsonb)`,
      );
      const summary = await loadReadiness(tx);
      expect(summary.training.trained).toBe(1);
      expect(summary.training.percent).toBe(Math.round((1 / 17) * 100));
      expect(summary.uat).toEqual({ scenarios: 2, passed: 1, percent: 50 });
      expect(summary.openDefects).toBe(1);
    });
  });

  it("raises the trained share when a missing module is recorded, and records it once per person", async () => {
    await asUser(app, priya, async () => {
      const before = await loadReadiness(tx);
      const incomplete = before.users.find(
        (u) =>
          !before.records.some((r) => r.user_id === u.id) ||
          before.modules
            .filter((m) => m.audience.includes(u.role))
            .some((m) => !before.records.some((r) => r.user_id === u.id && r.module_key === m.key)),
      );
      expect(incomplete).toBeDefined();
      for (const mod of before.modules.filter((m) => m.audience.includes(incomplete!.role))) {
        if (!before.records.some((r) => r.user_id === incomplete!.id && r.module_key === mod.key)) {
          await app.query(`SELECT app.record_training($1, $2, ${today})`, [incomplete!.id, mod.key]);
        }
      }
      const after = await loadReadiness(tx);
      expect(after.training.trained).toBe(before.training.trained + 1);
      expect(after.training.percent).toBeGreaterThan(before.training.percent ?? 0);
      const first = before.modules.find((m) => m.audience.includes(incomplete!.role))!;
      expect(
        await code(() => app.query(`SELECT app.record_training($1, $2, ${today})`, [incomplete!.id, first.key])),
      ).toBe("23505");
    });
  });

  it("records training for Finance users only, for known modules, with a real date", async () => {
    await asUser(app, priya, async () => {
      expect(await code(() => app.query(`SELECT app.record_training($1, 'orientation', ${today})`, [maria]))).toBe(
        "23514",
      );
      expect(await code(() => app.query(`SELECT app.record_training($1, 'unknown-module', ${today})`, [daniel]))).toBe(
        "23503",
      );
      expect(
        await code(() => app.query(`SELECT app.record_training($1, 'forms-initiatives', ${today} + 1)`, [daniel])),
      ).toBe("23514");
    });
    await asUser(app, daniel, async () => {
      expect(
        await code(() => app.query(`SELECT app.record_training($1, 'forms-initiatives', ${today})`, [daniel])),
      ).toBe("42501");
    });
  });
});
