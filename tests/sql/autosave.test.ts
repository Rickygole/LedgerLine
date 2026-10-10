import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";
import { appUrl, connect, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
let app: Client;
let maria: string;
let daniel: string;
let target: { assignment: string; form: string; award: string };

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  maria = await userId(owner, "maria.santos");
  daniel = await userId(owner, "daniel.cho");
  const orgId = (await owner.query("SELECT org_id FROM app_user WHERE id = $1", [maria])).rows[0].org_id;
  target = (
    await owner.query(
      `SELECT a.id AS assignment, f.id AS form, a.award_amount::text AS award FROM assignment a JOIN initiative i ON i.id = a.initiative_id AND i.fiscal_year_id = 'FY27' JOIN form_version f ON f.initiative_id = a.initiative_id AND f.status = 'published'
       WHERE a.org_id = $1 AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = 'FY27-MY') LIMIT 1`,
      [orgId],
    )
  ).rows[0];
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function as(user: string) {
  await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
}

async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    return await fn();
  } finally {
    await app.query("ROLLBACK");
  }
}

const tx: Tx = {
  async query(sql, params = []) {
    return (await app.query(sql, params)).rows as never;
  },
  async one(sql, params = []) {
    return ((await app.query(sql, params)).rows[0] ?? null) as never;
  },
};

async function startDraft(): Promise<string> {
  await as(maria);
  const id = (await app.query("SELECT gen_random_uuid() AS id")).rows[0].id as string;
  await app.query(
    `INSERT INTO submission (id, reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
     VALUES ($1, $2, $3, 'FY27-MY', $4, 'draft', app.uid(), app.uid())`,
    [id, `LL-TEST-${id.slice(0, 8)}`, target.assignment, target.form],
  );
  return id;
}

async function newId(): Promise<string> {
  return (await app.query("SELECT gen_random_uuid() AS id")).rows[0].id as string;
}

describe("[US-018] autosave takes the draft lock and refuses stale or replayed writes correctly", () => {
  it("advances the lock by one for each save made from the current lock", async () => {
    await inTransaction(async () => {
      const { touchDraft } = await import("@/lib/report/write");
      const id = await startDraft();
      const first = await touchDraft(tx, { submissionId: id, expectedLock: 0, saveId: await newId() });
      expect(first).toMatchObject({ status: "touched", lockVersion: 1 });
      const second = await touchDraft(tx, { submissionId: id, expectedLock: 1, saveId: await newId() });
      expect(second).toMatchObject({ status: "touched", lockVersion: 2 });
    });
  });

  it("reports a stale copy, with who saved last, when the lock is behind", async () => {
    await inTransaction(async () => {
      const { touchDraft } = await import("@/lib/report/write");
      const id = await startDraft();
      await touchDraft(tx, { submissionId: id, expectedLock: 0, saveId: await newId() });
      const stale = await touchDraft(tx, { submissionId: id, expectedLock: 0, saveId: await newId() });
      expect(stale.status).toBe("stale");
      if (stale.status === "stale") {
        expect(stale.by).toBe("Maria Santos");
        expect(stale.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
      const lock = (await app.query("SELECT lock_version FROM submission WHERE id = $1", [id])).rows[0].lock_version;
      expect(lock).toBe(1);
    });
  });

  it("accepts a replay of the same save id once without advancing the lock a second time", async () => {
    await inTransaction(async () => {
      const { touchDraft } = await import("@/lib/report/write");
      const id = await startDraft();
      const saveId = await newId();
      const first = await touchDraft(tx, { submissionId: id, expectedLock: 0, saveId });
      expect(first).toMatchObject({ status: "touched", lockVersion: 1 });
      const replay = await touchDraft(tx, { submissionId: id, expectedLock: 0, saveId });
      expect(replay).toMatchObject({ status: "touched", lockVersion: 2 });
      const other = await touchDraft(tx, { submissionId: id, expectedLock: 0, saveId: await newId() });
      expect(other.status).toBe("stale");
    });
  });

  it("refuses a save once the report has been submitted", async () => {
    await inTransaction(async () => {
      const { touchDraft } = await import("@/lib/report/write");
      const id = await startDraft();
      await app.query(
        "INSERT INTO budget_line (submission_id, row_id, position, category, description, amount) VALUES ($1, gen_random_uuid(), 1, 'PS', 'Staff', $2)",
        [id, target.award],
      );
      const snapshot = JSON.stringify({
        formVersionId: "f",
        answers: {},
        budget: [{ position: 1, category: "PS", description: "Staff", amount: Number(target.award) }],
        attachments: [],
      });
      await app.query("SELECT * FROM app.transition_submission($1, 'submit', 0, $2::jsonb, NULL, NULL, NULL)", [
        id,
        snapshot,
      ]);
      const locked = await touchDraft(tx, { submissionId: id, expectedLock: 1, saveId: await newId() });
      expect(locked).toEqual({ status: "locked" });
    });
  });

  it("reports a report that does not exist or is not visible as missing", async () => {
    await inTransaction(async () => {
      const { touchDraft } = await import("@/lib/report/write");
      await as(daniel);
      const gone = await touchDraft(tx, { submissionId: await newId(), expectedLock: 0, saveId: await newId() });
      expect(gone).toEqual({ status: "missing" });
    });
  });
});
