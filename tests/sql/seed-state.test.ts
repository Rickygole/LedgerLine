import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MARIA_REMAINING_BUDGET } from "../../scripts/seed";
import { connect, ownerUrl } from "./helpers";

let owner: Client;

beforeAll(async () => {
  owner = await connect(ownerUrl());
});

afterAll(async () => {
  await owner?.end();
});

const count = async (sql: string) => (await owner.query(sql)).rows[0].n as number;

describe("[US-065][US-066] the starting data matches a system that has not gone live", () => {
  it("holds no training or test session yet and lists the scheduled ones", async () => {
    expect(await count("SELECT count(*)::int AS n FROM training_record")).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM uat_session")).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM readiness_schedule WHERE scheduled_on < '2026-11-30'")).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM readiness_schedule WHERE kind = 'test'")).toBeGreaterThan(0);
    expect(await count("SELECT count(*)::int AS n FROM readiness_schedule WHERE kind = 'training'")).toBeGreaterThan(0);
  });

  it("lists each scheduled session once however many times the data was reseeded", async () => {
    expect(
      await count(
        `SELECT count(*)::int AS n FROM (
           SELECT kind, scheduled_on, title, audience FROM readiness_schedule GROUP BY 1, 2, 3, 4 HAVING count(*) > 1
         ) d`,
      ),
    ).toBe(0);
    expect(
      await count(
        `SELECT count(*)::int AS n FROM (
           SELECT period_id, offset_days FROM reminder_rule GROUP BY 1, 2 HAVING count(*) > 1
         ) d`,
      ),
    ).toBe(0);
  });
});

describe("[US-058] the starting data has no past security incident", () => {
  it("records none and keeps the designated contacts", async () => {
    expect(await count("SELECT count(*)::int AS n FROM security_incident")).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM incident_contact WHERE active")).toBeGreaterThanOrEqual(2);
  });
});

describe("[US-061] the starting support queue meets the 24 hour target", () => {
  it("has no unanswered request older than 24 hours and no late first response", async () => {
    expect(
      await count(
        "SELECT count(*)::int AS n FROM support_request WHERE first_response_at IS NULL AND created_at < now() - interval '24 hours'",
      ),
    ).toBe(0);
    expect(
      await count(
        "SELECT count(*)::int AS n FROM support_request WHERE first_response_at > created_at + interval '24 hours'",
      ),
    ).toBe(0);
  });
});

describe("the starting Finance staff", () => {
  it("share no surname and carry a title that fits their role", async () => {
    const staff = (
      await owner.query<{ full_name: string; role: string; title: string }>(
        "SELECT full_name, role, title FROM app_user WHERE role <> 'cbo_submitter' AND email <> 'system.scheduler@ledgerline.example'",
      )
    ).rows;
    const surnames = staff.map((s) => s.full_name.split(" ").slice(1).join(" "));
    expect(new Set(surnames).size).toBe(surnames.length);
    for (const person of staff) {
      if (person.role === "finance_analyst") expect(person.title).toMatch(/Analyst/);
      if (person.role === "finance_viewer") expect(person.title).not.toMatch(/Analyst/);
      if (person.role === "finance_admin") expect(person.title).toMatch(/Director|Head/);
    }
  });
});

describe("the starting reports follow the reporting calendar", () => {
  it("has no FY27 Mid-Year report before that period opens", async () => {
    expect(await count("SELECT count(*)::int AS n FROM submission WHERE period_id = 'FY27-MY'")).toBe(0);
  });

  it("spreads Year-End filings across the filing window with a rush near the due date", async () => {
    const months = (
      await owner.query<{ month: string; n: number }>(
        `SELECT to_char(submitted_at AT TIME ZONE 'America/New_York', 'YYYY-MM') AS month, count(*)::int AS n
         FROM submission WHERE period_id = 'FY26-YE' AND submitted_at IS NOT NULL GROUP BY 1 ORDER BY 1`,
      )
    ).rows;
    const byMonth = Object.fromEntries(months.map((m) => [m.month, m.n]));
    for (const month of ["2026-07", "2026-08", "2026-09"]) expect(byMonth[month], month).toBeGreaterThan(10);
    expect(byMonth["2026-09"]).toBeGreaterThan(byMonth["2026-07"]);
  });

  it("links a reminder to the one report it is about", async () => {
    const row = (
      await owner.query(
        `SELECT s.reference_no FROM outbox o JOIN submission s ON s.id = o.submission_id
         WHERE o.template = 'reminder' AND o.subject LIKE 'Past due: FY26 Year-End%'
           AND o.org_id = (SELECT org_id FROM app_user WHERE email LIKE 'maria.santos%')`,
      )
    ).rows[0];
    expect(row.reference_no).toBe("LL-26YE-00002");
  });
});

describe("[US-021] Maria's pasted budget lines bring her draft to the award", () => {
  it("codes the evaluation consultant as other than personal services and balances to $85,000", async () => {
    const draft = (
      await owner.query(
        `SELECT coalesce(sum(b.amount), 0)::float8 AS total, count(*)::int AS lines
         FROM budget_line b JOIN submission s ON s.id = b.submission_id
         JOIN assignment a ON a.id = s.assignment_id
         WHERE s.reference_no = 'LL-26YE-00002'`,
      )
    ).rows[0];
    expect(draft.lines).toBe(11);
    expect(draft.total).toBe(71401);
    const consultant = MARIA_REMAINING_BUDGET.find(
      ([, description]) => description === "Program evaluation consultant",
    );
    expect(consultant?.[0]).toBe("OTPS");
    const pasted = MARIA_REMAINING_BUDGET.reduce((sum, [, , amount]) => sum + amount, 0);
    expect(draft.total + pasted).toBe(85000);
  });
});
