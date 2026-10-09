import "server-only";
import type { Tx } from "@/lib/db";
import { usingBlob } from "@/lib/storage";
import type { Answers, AnswerValue, BudgetLine, FormDefinition } from "@/lib/rules/types";
import type { AttachmentItem, EditorPayload, ReportHeader, ReportStatus } from "./types";

type HeaderRow = {
  id: string;
  reference_no: string;
  status: ReportStatus;
  revision: number;
  lock_version: number;
  form_version_id: string;
  definition: FormDefinition;
  initiative_name: string;
  period_label: string;
  starts_on: string;
  ends_on: string;
  due_on: string;
  award_amount: string;
  legal_name: string;
  ein: string;
  org_id: string;
  assignment_id: string;
  period_id: string;
  updated_at: string;
  updated_by_name: string | null;
  submitted_at: string | null;
  submitted_by_name: string | null;
};

export type LoadedReport = {
  header: ReportHeader;
  definition: FormDefinition;
  formVersionId: string;
  orgId: string;
};

export async function loadReport(tx: Tx, submissionId: string): Promise<LoadedReport | null> {
  const row = await tx.one<HeaderRow>(
    `SELECT s.id, s.reference_no, s.status, s.revision, s.lock_version, s.form_version_id, s.assignment_id, s.period_id,
            fv.definition, i.name AS initiative_name, rp.label AS period_label,
            to_char(rp.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(rp.ends_on, 'YYYY-MM-DD') AS ends_on, to_char(rp.due_on, 'YYYY-MM-DD') AS due_on,
            a.award_amount, a.org_id, o.legal_name, o.ein,
            s.updated_at, uu.full_name AS updated_by_name, s.submitted_at, sb.full_name AS submitted_by_name
     FROM submission s
     JOIN assignment a ON a.id = s.assignment_id
     JOIN initiative i ON i.id = a.initiative_id
     JOIN organization o ON o.id = a.org_id
     JOIN reporting_period rp ON rp.id = s.period_id
     JOIN form_version fv ON fv.id = s.form_version_id
     LEFT JOIN app_user uu ON uu.id = s.updated_by
     LEFT JOIN app_user sb ON sb.id = s.submitted_by
     WHERE s.id = $1`,
    [submissionId]
  );
  if (!row) return null;
  return {
    formVersionId: row.form_version_id,
    definition: row.definition,
    orgId: row.org_id,
    header: {
      id: row.id,
      referenceNo: row.reference_no,
      status: row.status,
      revision: row.revision,
      lockVersion: row.lock_version,
      initiativeName: row.initiative_name,
      periodLabel: row.period_label,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      dueOn: row.due_on,
      awardAmount: Number(row.award_amount),
      orgName: row.legal_name,
      ein: row.ein,
      updatedAt: new Date(row.updated_at).toISOString(),
      updatedByName: row.updated_by_name,
      submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      submittedByName: row.submitted_by_name,
    },
  };
}

export async function loadAnswers(tx: Tx, submissionId: string): Promise<{ answers: Answers; updatedAt: Record<string, string> }> {
  const rows = await tx.query<{ question_key: string; value: AnswerValue; updated_at: string }>(
    "SELECT question_key, value, updated_at FROM answer WHERE submission_id = $1",
    [submissionId]
  );
  const answers: Answers = {};
  const updatedAt: Record<string, string> = {};
  for (const row of rows) {
    answers[row.question_key] = row.value;
    updatedAt[row.question_key] = new Date(row.updated_at).toISOString();
  }
  return { answers, updatedAt };
}

export async function loadBudget(tx: Tx, submissionId: string): Promise<BudgetLine[]> {
  const rows = await tx.query<{ row_id: string; position: number; category: "PS" | "OTPS"; description: string; amount: string; actual_spent: string | null }>(
    "SELECT row_id, position, category, description, amount, actual_spent FROM budget_line WHERE submission_id = $1 ORDER BY position, row_id",
    [submissionId]
  );
  return rows.map((row) => ({
    rowId: row.row_id,
    position: row.position,
    category: row.category,
    description: row.description,
    amount: Number(row.amount),
    actual: row.actual_spent === null ? null : Number(row.actual_spent),
  }));
}

export async function loadAttachments(tx: Tx, submissionId: string): Promise<AttachmentItem[]> {
  const rows = await tx.query<{ id: string; filename: string; bytes: string; created_at: string; full_name: string | null }>(
    `SELECT t.id, t.filename, t.bytes, t.created_at, u.full_name
     FROM attachment t LEFT JOIN app_user u ON u.id = t.uploaded_by
     WHERE t.submission_id = $1 ORDER BY t.created_at, t.id`,
    [submissionId]
  );
  return rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    bytes: Number(row.bytes),
    uploadedAt: new Date(row.created_at).toISOString(),
    uploadedByName: row.full_name,
  }));
}

export function sectionOfQuestion(definition: FormDefinition, key: string): string | null {
  return definition.sections.find((section) => section.questions.some((question) => question.key === key))?.key ?? null;
}

export function withOrgDefaults(answers: Answers, orgName: string, ein: string): Answers {
  const merged: Answers = { ...answers };
  const blank = (value: AnswerValue | undefined) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");
  if (blank(merged.org_legal_name)) merged.org_legal_name = orgName;
  if (blank(merged.org_ein)) merged.org_ein = ein;
  return merged;
}

export function resumeSectionFor(definition: FormDefinition, updatedAt: Record<string, string>): string | null {
  const order = definition.sections.map((section) => section.key);
  let best: { key: string; at: string; rank: number } | null = null;
  for (const [questionKey, at] of Object.entries(updatedAt)) {
    const sectionKey = sectionOfQuestion(definition, questionKey);
    if (!sectionKey) continue;
    const rank = order.indexOf(sectionKey);
    if (!best || at > best.at || (at === best.at && rank > best.rank)) best = { key: sectionKey, at, rank };
  }
  return best?.key ?? null;
}

export async function loadEditorPayload(tx: Tx, report: LoadedReport, currentUserName: string, currentUserTitle: string): Promise<EditorPayload> {
  const { answers, updatedAt } = await loadAnswers(tx, report.header.id);
  const budget = await loadBudget(tx, report.header.id);
  const attachments = await loadAttachments(tx, report.header.id);
  return {
    header: report.header,
    definition: report.definition,
    answers: withOrgDefaults(answers, report.header.orgName, report.header.ein),
    budget,
    attachments,
    storage: usingBlob() ? "blob" : "local",
    resumeSection: resumeSectionFor(report.definition, updatedAt),
    hasProgress: Object.keys(updatedAt).some((key) => key !== "org_legal_name" && key !== "org_ein") || budget.length > 0,
    currentUserName,
    currentUserTitle,
  };
}
