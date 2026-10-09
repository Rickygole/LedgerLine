import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
let maria: string;
let target: { assignment: string; period: string } | null = null;
let created: string | null = null;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  maria = await userId(owner, "maria.santos");
  const row = (
    await owner.query(
      `SELECT a.id AS assignment, rp.id AS period
       FROM assignment a
       JOIN app_user u ON u.org_id = a.org_id AND u.id = $1
       JOIN initiative i ON i.id = a.initiative_id
       JOIN reporting_period rp ON true
       WHERE NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = rp.id)
         AND EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')
       LIMIT 1`,
      [maria]
    )
  ).rows[0];
  target = row ? { assignment: row.assignment, period: row.period } : null;
});

afterAll(async () => {
  if (created) {
    await owner.query("DELETE FROM answer WHERE submission_id = $1", [created]);
    await owner.query("DELETE FROM submission WHERE id = $1", [created]);
  }
  await owner?.end();
});

async function countSubmissions(): Promise<number> {
  return (await owner.query("SELECT count(*)::int AS n FROM submission WHERE assignment_id = $1 AND period_id = $2", [target!.assignment, target!.period])).rows[0].n;
}

describe("[US-024][D19] opening the start page does not create a draft", () => {
  it("has an assignment and period with no report yet", () => {
    expect(target).not.toBeNull();
  });

  it("looks up a report without writing anything", async () => {
    const { findReport } = await import("@/lib/report/create");
    const before = await countSubmissions();
    const first = await findReport(maria, target!.assignment, target!.period);
    const second = await findReport(maria, target!.assignment, target!.period);
    expect(first).toEqual({ status: "none" });
    expect(second).toEqual({ status: "none" });
    expect(await countSubmissions()).toBe(before);
  });

  it("creates the draft and writes a start audit event only when started", async () => {
    const { startReport, findReport } = await import("@/lib/report/create");
    const result = await startReport(maria, target!.assignment, target!.period);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    created = result.submissionId;
    expect(result.created).toBe(true);
    expect(await countSubmissions()).toBe(1);

    const audit = (await owner.query("SELECT action, actor_id FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [created])).rows;
    expect(audit).toEqual([{ action: "start", actor_id: maria }]);

    const again = await startReport(maria, target!.assignment, target!.period);
    expect(again).toEqual({ status: "ok", submissionId: created, created: false });
    expect(await findReport(maria, target!.assignment, target!.period)).toEqual({ status: "found", submissionId: created });
    expect((await owner.query("SELECT count(*)::int AS n FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [created])).rows[0].n).toBe(1);
  });
});
