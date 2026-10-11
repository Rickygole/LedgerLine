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
       JOIN reporting_period rp ON rp.fiscal_year_id = i.fiscal_year_id
       WHERE NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = rp.id)
         AND EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')
       LIMIT 1`,
      [maria],
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
  return (
    await owner.query("SELECT count(*)::int AS n FROM submission WHERE assignment_id = $1 AND period_id = $2", [
      target!.assignment,
      target!.period,
    ])
  ).rows[0].n;
}

describe("[US-016] opening the start page does not create a draft", () => {
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

    const audit = (
      await owner.query("SELECT action, actor_id FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [
        created,
      ])
    ).rows;
    expect(audit).toEqual([{ action: "start", actor_id: maria }]);

    const again = await startReport(maria, target!.assignment, target!.period);
    expect(again).toEqual({ status: "ok", submissionId: created, created: false });
    expect(await findReport(maria, target!.assignment, target!.period)).toEqual({
      status: "found",
      submissionId: created,
    });
    expect(
      (
        await owner.query("SELECT count(*)::int AS n FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [
          created,
        ])
      ).rows[0].n,
    ).toBe(1);
  });
});

describe("[US-034][BR-024] a new report fills in the organization details that are on file", () => {
  it("prefills the contact from the organization's primary contact and leaves nothing for the submitter to retype", async () => {
    const answers = Object.fromEntries(
      (await owner.query("SELECT question_key, value FROM answer WHERE submission_id = $1", [created])).rows.map(
        (row) => [row.question_key, row.value],
      ),
    );
    const primary = (
      await owner.query(
        `SELECT c.full_name, c.title, c.email, c.phone, o.legal_name, o.ein
         FROM contact c JOIN organization o ON o.id = c.org_id
         WHERE c.is_primary AND c.org_id = (SELECT org_id FROM app_user WHERE id = $1)`,
        [maria],
      )
    ).rows[0];
    expect(answers).toMatchObject({
      org_legal_name: primary.legal_name,
      org_ein: primary.ein,
      contact_name: primary.full_name,
      contact_title: primary.title,
      contact_email: primary.email,
    });
    if (primary.phone) expect(answers.contact_phone).toBe(primary.phone);
  });

  it("leaves the seeded draft alone", async () => {
    const seeded = (
      await owner.query(
        `SELECT count(*)::int AS lines, sum(b.amount)::float AS total
         FROM budget_line b JOIN submission s ON s.id = b.submission_id WHERE s.reference_no = 'LL-26YE-00002'`,
      )
    ).rows[0];
    expect(seeded).toEqual({ lines: 11, total: 71401 });
  });
});

describe("[BR-009][US-016] a report is only started for a period the initiative owes", () => {
  let crossAssignment: string | null = null;
  let crossPeriod: string | null = null;

  beforeAll(async () => {
    const row = (
      await owner.query(
        `SELECT a.id AS assignment, rp.id AS period
         FROM assignment a
         JOIN app_user u ON u.org_id = a.org_id AND u.id = $1
         JOIN initiative i ON i.id = a.initiative_id
         JOIN reporting_period rp ON rp.fiscal_year_id <> i.fiscal_year_id
         WHERE NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = rp.id)
         LIMIT 1`,
        [maria],
      )
    ).rows[0];
    crossAssignment = row?.assignment ?? null;
    crossPeriod = row?.period ?? null;
  });

  it("has an assignment and a period from another fiscal year", () => {
    expect(crossAssignment).not.toBeNull();
  });

  it("refuses to start or look up a report across fiscal years", async () => {
    const { startReport, findReport } = await import("@/lib/report/create");
    expect(await startReport(maria, crossAssignment!, crossPeriod!)).toEqual({ status: "not_found" });
    expect(await findReport(maria, crossAssignment!, crossPeriod!)).toEqual({ status: "not_found" });
    const n = (
      await owner.query("SELECT count(*)::int AS n FROM submission WHERE assignment_id = $1 AND period_id = $2", [
        crossAssignment,
        crossPeriod,
      ])
    ).rows[0].n;
    expect(n).toBe(0);
  });

  it("refuses the same row from any database path", async () => {
    const form = (
      await owner.query(
        "SELECT fv.id FROM form_version fv JOIN assignment a ON a.initiative_id = fv.initiative_id WHERE a.id = $1 LIMIT 1",
        [crossAssignment],
      )
    ).rows[0];
    await expect(
      owner.query(
        "INSERT INTO submission (reference_no, assignment_id, period_id, form_version_id, status) VALUES ('LL-TEST-99999', $1, $2, $3, 'draft')",
        [crossAssignment, crossPeriod, form.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (await owner.query("SELECT count(*)::int AS n FROM submission WHERE reference_no = 'LL-TEST-99999'")).rows[0].n,
    ).toBe(0);
  });

  it("numbers new references in sequence per period", async () => {
    const first = (await owner.query("SELECT app.next_reference_no($1) AS n", [target!.period])).rows[0].n as string;
    const second = (await owner.query("SELECT app.next_reference_no($1) AS n", [target!.period])).rows[0].n as string;
    expect(first).toMatch(/^LL-\d{2}(MY|YE)-\d{5}$/);
    expect(Number(second.slice(-5))).toBe(Number(first.slice(-5)) + 1);
    const max = (
      await owner.query(
        "SELECT max(substring(reference_no from '-(0\\d{4})$')::int) AS m FROM submission WHERE period_id = $1",
        [target!.period],
      )
    ).rows[0].m as number;
    expect(Number(first.slice(-5))).toBeGreaterThan(max);
  });
});
