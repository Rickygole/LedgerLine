import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";
import { appUrl, connect, errorCode, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
let app: Client;
let maria: string;
let daniel: string;
let target: { assignment: string; form: string };
let ein: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  maria = await userId(owner, "maria.santos");
  daniel = await userId(owner, "daniel.cho");
  const orgId = (await owner.query("SELECT org_id FROM app_user WHERE id = $1", [maria])).rows[0].org_id;
  ein = (await owner.query("SELECT ein FROM organization WHERE id = $1", [orgId])).rows[0].ein;
  target = (
    await owner.query(
      `SELECT a.id AS assignment, f.id AS form FROM assignment a JOIN form_version f ON f.initiative_id = a.initiative_id AND f.status = 'published'
       WHERE a.org_id = $1 AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = 'FY27-MY') LIMIT 1`,
      [orgId]
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

function asTx(client: Client): Tx {
  return {
    async query(sql, params = []) {
      return (await client.query(sql, params)).rows as never;
    },
    async one(sql, params = []) {
      return ((await client.query(sql, params)).rows[0] ?? null) as never;
    },
  };
}

async function startDraft(): Promise<string> {
  await as(maria);
  const id = (await app.query("SELECT gen_random_uuid() AS id")).rows[0].id as string;
  await app.query(
    `INSERT INTO submission (id, reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
     VALUES ($1, $2, $3, 'FY27-MY', $4, 'draft', app.uid(), app.uid())`,
    [id, `LL-TEST-${id.slice(0, 8)}`, target.assignment, target.form]
  );
  return id;
}

const SNAPSHOT = JSON.stringify({ formVersionId: "f", answers: {}, budget: [], attachments: [] });

async function submit(id: string) {
  await as(maria);
  const lock = (await app.query("SELECT lock_version FROM submission WHERE id = $1", [id])).rows[0].lock_version;
  await app.query("SELECT * FROM app.transition_submission($1, 'submit', $2, $3::jsonb, NULL, NULL, NULL)", [id, lock, SNAPSHOT]);
}

describe("[BR-019][US-056] submitted data is kept and cannot be removed or edited by the organization", () => {
  it("denies deleting a submission, an answer or a budget line once the report is submitted", async () => {
    await inTransaction(async () => {
      const id = await startDraft();
      await app.query("INSERT INTO answer (submission_id, question_key, value, updated_by) VALUES ($1, 'contact_name', '\"Maria\"', app.uid())", [id]);
      await app.query("INSERT INTO budget_line (submission_id, row_id, position, category, description, amount) VALUES ($1, gen_random_uuid(), 1, 'PS', 'Coordinator', 100)", [id]);
      await submit(id);
      await app.query("SAVEPOINT a");
      expect(await errorCode(() => app.query("DELETE FROM submission WHERE id = $1", [id]))).toBe("42501");
      await app.query("ROLLBACK TO SAVEPOINT a");
      const answerEdit = await app.query("UPDATE answer SET value = '\"Changed\"' WHERE submission_id = $1", [id]);
      const answerDelete = await app.query("DELETE FROM answer WHERE submission_id = $1", [id]);
      const budgetDelete = await app.query("DELETE FROM budget_line WHERE submission_id = $1", [id]);
      expect([answerEdit.rowCount, answerDelete.rowCount, budgetDelete.rowCount]).toEqual([0, 0, 0]);
      await as(daniel);
      await app.query("SAVEPOINT b");
      expect(await errorCode(() => app.query("DELETE FROM submission WHERE id = $1", [id]))).toBe("42501");
      await app.query("ROLLBACK TO SAVEPOINT b");
      const kept = (await app.query("SELECT value FROM answer WHERE submission_id = $1", [id])).rows[0].value;
      expect(kept).toBe("Maria");
    });
  });
});

describe("[US-057][BR-019] what the append-only triggers do", () => {
  it("rejects update, delete and truncate of the audit trail and revisions for the table owner while the triggers are enabled", async () => {
    await owner.query("BEGIN");
    try {
      for (const sql of [
        "UPDATE audit_event SET note = 'x' WHERE id = (SELECT min(id) FROM audit_event)",
        "DELETE FROM audit_event WHERE id = (SELECT min(id) FROM audit_event)",
        "TRUNCATE audit_event",
        "UPDATE submission_revision SET reason = 'x' WHERE id = (SELECT min(id) FROM submission_revision)",
        "DELETE FROM submission_revision WHERE id = (SELECT min(id) FROM submission_revision)",
        "TRUNCATE submission_revision",
      ]) {
        await owner.query("SAVEPOINT t");
        expect(await errorCode(() => owner.query(sql))).toBe("42501");
        await owner.query("ROLLBACK TO SAVEPOINT t");
      }
    } finally {
      await owner.query("ROLLBACK");
    }
  });

  it("does not let the application role switch the triggers off", async () => {
    await inTransaction(async () => {
      await as(daniel);
      expect(await errorCode(() => app.query("ALTER TABLE audit_event DISABLE TRIGGER audit_event_append_only"))).toBe("42501");
      await app.query("ROLLBACK");
      await app.query("BEGIN");
      await as(daniel);
      expect(await errorCode(() => app.query("DROP TRIGGER audit_event_append_only ON audit_event"))).toBe("42501");
    });
  });

  it("is a control on the table owner too, not a guarantee against one: the owner can disable a trigger", async () => {
    await owner.query("BEGIN");
    try {
      await owner.query("ALTER TABLE audit_event DISABLE TRIGGER audit_event_append_only");
      const updated = await owner.query("UPDATE audit_event SET note = note WHERE id = (SELECT min(id) FROM audit_event)");
      expect(updated.rowCount).toBe(1);
    } finally {
      await owner.query("ROLLBACK");
    }
  });
});

describe("[US-022] several supporting documents can be attached to one report", () => {
  it("stores each file against the report and stops at twenty files", async () => {
    const { attachmentLimitProblem, insertAttachment } = await import("@/lib/report/attachments");
    await inTransaction(async () => {
      const id = await startDraft();
      const tx = asTx(app);
      for (let n = 1; n <= 3; n++) {
        const item = await insertAttachment(tx, { submissionId: id, pathname: `${ein}/${id}/f${n}.pdf`, filename: `invoice-${n}.pdf`, bytes: 1000 * n, mime: "application/pdf" });
        expect(item.filename).toBe(`invoice-${n}.pdf`);
      }
      const names = (await app.query("SELECT filename FROM attachment WHERE submission_id = $1 ORDER BY filename", [id])).rows.map((r) => r.filename);
      expect(names).toEqual(["invoice-1.pdf", "invoice-2.pdf", "invoice-3.pdf"]);
      expect(await attachmentLimitProblem(tx, id, 1000)).toBeNull();
      for (let n = 4; n <= 20; n++) {
        await insertAttachment(tx, { submissionId: id, pathname: `${ein}/${id}/f${n}.pdf`, filename: `invoice-${n}.pdf`, bytes: 1000, mime: "application/pdf" });
      }
      expect(await attachmentLimitProblem(tx, id, 1000)).toBe("A report can have at most 20 files. Remove one to add another.");
    });
  });

  it("refuses new files after the report is submitted", async () => {
    await inTransaction(async () => {
      const id = await startDraft();
      await submit(id);
      await as(maria);
      const code = await errorCode(() =>
        app.query("INSERT INTO attachment (submission_id, path, filename, bytes, mime, uploaded_by) VALUES ($1, 'p', 'late.pdf', 10, 'application/pdf', app.uid())", [id])
      );
      expect(code).toBe("42501");
    });
  });
});
