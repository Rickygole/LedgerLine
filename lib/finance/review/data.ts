import type { Tx } from "@/lib/db";
import type { Answers, BudgetLine, FormDefinition } from "@/lib/rules/types";
import { finishRow } from "./derive";
import type { OpenFlag, PeriodInfo, ReportRow } from "./types";

export async function loadPeriods(tx: Tx): Promise<PeriodInfo[]> {
  const rows = await tx.query<{ id: string; label: string; due_on: string; fiscal_year_id: string }>(
    "SELECT id, label, due_on::text, fiscal_year_id FROM reporting_period ORDER BY due_on"
  );
  return rows.map((r) => ({ id: r.id, label: r.label, dueOn: r.due_on, fiscalYearId: r.fiscal_year_id }));
}

type BaseRow = {
  assignment_id: string;
  org_id: string;
  legal_name: string;
  ein: string;
  borough: string;
  initiative_id: string;
  initiative_name: string;
  code: string;
  category: string;
  award: number;
  submission_id: string | null;
  reference_no: string | null;
  status: string | null;
  revision: number | null;
  lock_version: number | null;
  submitted_at: string | null;
  updated_at: string | null;
  form_version_id: string | null;
};

export async function loadReportRows(tx: Tx, period: PeriodInfo): Promise<ReportRow[]> {
  const base = await tx.query<BaseRow>(
    `SELECT a.id AS assignment_id, o.id AS org_id, o.legal_name, o.ein, o.borough,
            i.id AS initiative_id, i.name AS initiative_name, i.code, i.category,
            a.award_amount::float8 AS award,
            s.id AS submission_id, s.reference_no, s.status, s.revision, s.lock_version,
            to_char(s.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS submitted_at, to_char(s.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at, s.form_version_id
     FROM assignment a
     JOIN organization o ON o.id = a.org_id
     JOIN initiative i ON i.id = a.initiative_id AND i.status = 'active'
     LEFT JOIN submission s ON s.assignment_id = a.id AND s.period_id = $1
     WHERE s.id IS NOT NULL OR EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')`,
    [period.id]
  );
  const submissionIds = base.map((r) => r.submission_id).filter((id): id is string => id !== null);
  const formIds = [...new Set(base.map((r) => r.form_version_id).filter((id): id is string => id !== null))];

  const [answerRows, budgetRows, formRows, flagRows] = await Promise.all([
    submissionIds.length
      ? tx.query<{ submission_id: string; answers: Answers }>(
          "SELECT submission_id, jsonb_object_agg(question_key, value) AS answers FROM answer WHERE submission_id = ANY($1::uuid[]) GROUP BY submission_id",
          [submissionIds]
        )
      : Promise.resolve([]),
    submissionIds.length
      ? tx.query<{ submission_id: string; row_id: string; position: number; category: "PS" | "OTPS"; description: string; amount: number }>(
          "SELECT submission_id, row_id, position, category, description, amount::float8 AS amount FROM budget_line WHERE submission_id = ANY($1::uuid[]) ORDER BY position",
          [submissionIds]
        )
      : Promise.resolve([]),
    formIds.length
      ? tx.query<{ id: string; definition: FormDefinition }>("SELECT id, definition FROM form_version WHERE id = ANY($1::uuid[])", [formIds])
      : Promise.resolve([]),
    submissionIds.length
      ? tx.query<{ id: string; submission_id: string; kind: string; note: string | null }>(
          "SELECT id, submission_id, kind, note FROM flag WHERE status = 'open' AND submission_id = ANY($1::uuid[]) ORDER BY created_at",
          [submissionIds]
        )
      : Promise.resolve([]),
  ]);

  const answersBySubmission = new Map(answerRows.map((r) => [r.submission_id, r.answers]));
  const budgetBySubmission = new Map<string, BudgetLine[]>();
  for (const line of budgetRows) {
    const list = budgetBySubmission.get(line.submission_id) ?? [];
    list.push({ rowId: line.row_id, position: line.position, category: line.category, description: line.description, amount: line.amount });
    budgetBySubmission.set(line.submission_id, list);
  }
  const definitions = new Map(formRows.map((r) => [r.id, r.definition]));
  const flagsBySubmission = new Map<string, OpenFlag[]>();
  for (const flag of flagRows) {
    const list = flagsBySubmission.get(flag.submission_id) ?? [];
    list.push({ id: flag.id, kind: flag.kind, note: flag.note });
    flagsBySubmission.set(flag.submission_id, list);
  }

  return base.map((r) =>
    finishRow({
      assignmentId: r.assignment_id,
      orgId: r.org_id,
      orgName: r.legal_name,
      ein: r.ein,
      borough: r.borough,
      initiativeId: r.initiative_id,
      initiativeName: r.initiative_name,
      initiativeCode: r.code,
      category: r.category,
      award: r.award,
      periodId: period.id,
      dueOn: period.dueOn,
      submissionId: r.submission_id,
      referenceNo: r.reference_no,
      status: r.status,
      revision: r.revision ?? 0,
      lockVersion: r.lock_version ?? 0,
      submittedAt: r.submitted_at,
      updatedAt: r.updated_at,
      formVersionId: r.form_version_id,
      answers: r.submission_id ? (answersBySubmission.get(r.submission_id) ?? {}) : {},
      budget: r.submission_id ? (budgetBySubmission.get(r.submission_id) ?? []) : [],
      definition: r.form_version_id ? (definitions.get(r.form_version_id) ?? null) : null,
      openFlags: r.submission_id ? (flagsBySubmission.get(r.submission_id) ?? []) : [],
    })
  );
}

export async function loadFilterOptions(tx: Tx) {
  const categories = await tx.query<{ category: string }>("SELECT DISTINCT category FROM initiative WHERE status = 'active' ORDER BY category");
  return { categories: categories.map((c) => c.category) };
}
