import "server-only";
import { randomUUID } from "node:crypto";
import { pgCode, withClaims } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import type { FormDefinition } from "@/lib/rules/types";

type StartResult =
  { status: "ok"; submissionId: string; created: boolean } | { status: "not_found" } | { status: "no_form" };

type ContactDefaults = {
  name: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  user_name: string | null;
  user_title: string | null;
  user_email: string | null;
};

export function contactAnswers(contact: ContactDefaults | null): Record<string, string> {
  const pick = (primary: string | null | undefined, fallback: string | null | undefined) =>
    primary?.trim() || fallback?.trim() || "";
  return {
    contact_name: pick(contact?.name, contact?.user_name),
    contact_title: pick(contact?.title, contact?.user_title),
    contact_email: pick(contact?.email, contact?.user_email),
    contact_phone: pick(contact?.phone, null),
  };
}

const OWED_PERIOD = `SELECT p.id FROM assignment a
  JOIN reporting_period p ON p.id = $2
  WHERE a.id = $1 AND app.requires_period(a.initiative_id, p.id)`;

export async function startReport(userId: string, assignmentId: string, periodId: string): Promise<StartResult> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const result = await withClaims(userId, async (tx): Promise<StartResult> => {
        const assignment = await tx.one<{ id: string; initiative_id: string; legal_name: string; ein: string }>(
          `SELECT a.id, a.initiative_id, o.legal_name, o.ein
           FROM assignment a JOIN organization o ON o.id = a.org_id JOIN initiative i ON i.id = a.initiative_id
           WHERE a.id = $1 AND a.org_id = app.org_id() AND i.retired_on IS NULL`,
          [assignmentId],
        );
        if (!assignment) return { status: "not_found" };
        const period = await tx.one<{ id: string }>(OWED_PERIOD, [assignmentId, periodId]);
        if (!period) return { status: "not_found" };

        const existing = await tx.one<{ id: string }>(
          "SELECT id FROM submission WHERE assignment_id = $1 AND period_id = $2",
          [assignmentId, periodId],
        );
        if (existing) return { status: "ok", submissionId: existing.id, created: false };

        const form = await tx.one<{ id: string; definition: FormDefinition }>(
          "SELECT id, definition FROM form_version WHERE initiative_id = $1 AND status = 'published'",
          [assignment.initiative_id],
        );
        if (!form) return { status: "no_form" };

        const created = { id: randomUUID() };
        const reference = await tx.one<{ reference_no: string }>("SELECT app.next_reference_no($1) AS reference_no", [
          periodId,
        ]);
        await tx.query(
          `INSERT INTO submission (id, reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, 'draft', app.uid(), app.uid())`,
          [created.id, reference!.reference_no, assignmentId, periodId, form.id],
        );
        const contact = await tx.one<ContactDefaults>(
          `SELECT c.full_name AS name, c.title, c.email, c.phone, u.full_name AS user_name, u.title AS user_title,
                  u.email AS user_email
           FROM app_user u
           LEFT JOIN LATERAL (
             SELECT full_name, title, email, phone FROM contact
             WHERE org_id = u.org_id ORDER BY is_primary DESC, full_name LIMIT 1
           ) c ON true
           WHERE u.id = app.uid()`,
        );
        const prefilled = {
          org_legal_name: assignment.legal_name,
          org_ein: assignment.ein,
          ...contactAnswers(contact),
        };
        const onForm = new Set(form.definition.sections.flatMap((section) => section.questions.map((q) => q.key)));
        const entries = Object.entries(prefilled).filter(
          ([key, value]) => value !== "" && (onForm.has(key) || key === "org_legal_name" || key === "org_ein"),
        );
        await tx.query(
          `INSERT INTO answer (submission_id, question_key, value, updated_by)
           SELECT $1, k, to_jsonb(v), app.uid() FROM unnest($2::text[], $3::text[]) AS t(k, v)`,
          [created.id, entries.map(([key]) => key), entries.map(([, value]) => value)],
        );
        await writeAudit(tx, {
          entity: "submission",
          entityId: created.id,
          action: "start",
          note: `${assignment.legal_name}, ${periodId}`,
        });
        return { status: "ok", submissionId: created.id, created: true };
      });
      return result;
    } catch (error) {
      if (pgCode(error) === "23505") continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a reference number");
}

type ExistingReport = { status: "found"; submissionId: string } | { status: "none" } | { status: "not_found" };

export async function findReport(userId: string, assignmentId: string, periodId: string): Promise<ExistingReport> {
  return withClaims(userId, async (tx): Promise<ExistingReport> => {
    const assignment = await tx.one<{ id: string }>(
      "SELECT id FROM assignment WHERE id = $1 AND org_id = app.org_id()",
      [assignmentId],
    );
    if (!assignment) return { status: "not_found" };
    const period = await tx.one<{ id: string }>(OWED_PERIOD, [assignmentId, periodId]);
    if (!period) return { status: "not_found" };
    const existing = await tx.one<{ id: string }>(
      "SELECT id FROM submission WHERE assignment_id = $1 AND period_id = $2",
      [assignmentId, periodId],
    );
    return existing ? { status: "found", submissionId: existing.id } : { status: "none" };
  });
}
