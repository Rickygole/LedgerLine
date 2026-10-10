import "server-only";
import type { Tx } from "@/lib/db";
import { toIsoTimestamp } from "@/lib/dates";
import type { Answers, BudgetLine } from "@/lib/rules/types";

export type TouchResult =
  | { status: "touched"; lockVersion: number; savedAt: string }
  | { status: "locked" }
  | { status: "stale"; by: string | null; at: string }
  | { status: "missing" };

export async function touchDraft(
  tx: Tx,
  input: { submissionId: string; expectedLock: number; saveId: string },
): Promise<TouchResult> {
  const touched = await tx.one<{ lock_version: number; updated_at: string }>(
    `UPDATE submission SET lock_version = lock_version + 1, updated_at = now(), updated_by = app.uid(), last_save_id = $3
     WHERE id = $1 AND status IN ('draft', 'returned') AND (lock_version = $2 OR (last_save_id = $3 AND lock_version = $2 + 1))
     RETURNING lock_version, updated_at`,
    [input.submissionId, input.expectedLock, input.saveId],
  );
  if (touched)
    return { status: "touched", lockVersion: touched.lock_version, savedAt: toIsoTimestamp(touched.updated_at) };
  const current = await tx.one<{ status: string; updated_at: string; full_name: string | null }>(
    `SELECT s.status, s.updated_at, u.full_name FROM submission s LEFT JOIN app_user u ON u.id = s.updated_by WHERE s.id = $1`,
    [input.submissionId],
  );
  if (!current) return { status: "missing" };
  if (current.status !== "draft" && current.status !== "returned") return { status: "locked" };
  return { status: "stale", by: current.full_name, at: toIsoTimestamp(current.updated_at) };
}

export async function writeDraft(
  tx: Tx,
  input: { submissionId: string; answers: Answers; budget: BudgetLine[]; allowedKeys: Set<string> },
) {
  const keys: string[] = [];
  const values: string[] = [];
  for (const [key, value] of Object.entries(input.answers)) {
    if (!input.allowedKeys.has(key)) continue;
    keys.push(key);
    values.push(JSON.stringify(value));
  }
  if (keys.length > 0) {
    await tx.query(
      `INSERT INTO answer (submission_id, question_key, value, updated_by, updated_at)
       SELECT $1, t.k, t.v::jsonb, app.uid(), now() FROM unnest($2::text[], $3::text[]) AS t(k, v)
       ON CONFLICT (submission_id, question_key) DO UPDATE
         SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
         WHERE answer.value IS DISTINCT FROM excluded.value`,
      [input.submissionId, keys, values],
    );
  }
  const lines = input.budget.map((line, index) => ({
    ...line,
    position: index + 1,
    amount: Math.round(line.amount * 100) / 100,
    actual: line.actual === null || line.actual === undefined ? null : Math.round(line.actual * 100) / 100,
  }));
  if (lines.length > 0) {
    await tx.query(
      `INSERT INTO budget_line (submission_id, row_id, position, category, description, amount, actual_spent)
       SELECT $1, t.r, t.p, t.c, t.d, t.a, t.s FROM unnest($2::uuid[], $3::int[], $4::text[], $5::text[], $6::numeric[], $7::numeric[]) AS t(r, p, c, d, a, s)
       ON CONFLICT (submission_id, row_id) DO UPDATE
         SET position = excluded.position, category = excluded.category, description = excluded.description, amount = excluded.amount, actual_spent = excluded.actual_spent`,
      [
        input.submissionId,
        lines.map((l) => l.rowId),
        lines.map((l) => l.position),
        lines.map((l) => l.category),
        lines.map((l) => l.description),
        lines.map((l) => l.amount),
        lines.map((l) => l.actual),
      ],
    );
  }
  await tx.query("DELETE FROM budget_line WHERE submission_id = $1 AND NOT (row_id = ANY($2::uuid[]))", [
    input.submissionId,
    lines.map((l) => l.rowId),
  ]);
}
