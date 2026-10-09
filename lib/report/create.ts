import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { pgCode, withClaims } from "@/lib/db";

export type StartResult = { status: "ok"; submissionId: string } | { status: "not_found" } | { status: "no_form" };

function referenceFor(periodId: string): string {
  const match = /^FY(\d{2})-([A-Z]+)$/.exec(periodId);
  const code = match ? `${match[1]}${match[2]}` : periodId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `LL-${code}-${String(randomInt(10000, 100000))}`;
}

export async function startReport(userId: string, assignmentId: string, periodId: string): Promise<StartResult> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const result = await withClaims(userId, async (tx): Promise<StartResult> => {
        const assignment = await tx.one<{ id: string; initiative_id: string; legal_name: string; ein: string }>(
          `SELECT a.id, a.initiative_id, o.legal_name, o.ein
           FROM assignment a JOIN organization o ON o.id = a.org_id
           WHERE a.id = $1 AND a.org_id = app.org_id()`,
          [assignmentId]
        );
        if (!assignment) return { status: "not_found" };
        const period = await tx.one<{ id: string }>("SELECT id FROM reporting_period WHERE id = $1", [periodId]);
        if (!period) return { status: "not_found" };

        const existing = await tx.one<{ id: string }>("SELECT id FROM submission WHERE assignment_id = $1 AND period_id = $2", [assignmentId, periodId]);
        if (existing) return { status: "ok", submissionId: existing.id };

        const form = await tx.one<{ id: string }>("SELECT id FROM form_version WHERE initiative_id = $1 AND status = 'published'", [assignment.initiative_id]);
        if (!form) return { status: "no_form" };

        const created = { id: randomUUID() };
        await tx.query(
          `INSERT INTO submission (id, reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, 'draft', app.uid(), app.uid())`,
          [created.id, referenceFor(periodId), assignmentId, periodId, form.id]
        );
        await tx.query(
          `INSERT INTO answer (submission_id, question_key, value, updated_by)
           VALUES ($1, 'org_legal_name', to_jsonb($2::text), app.uid()), ($1, 'org_ein', to_jsonb($3::text), app.uid())`,
          [created.id, assignment.legal_name, assignment.ein]
        );
        return { status: "ok", submissionId: created.id };
      });
      return result;
    } catch (error) {
      if (pgCode(error) === "23505") continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a reference number");
}
