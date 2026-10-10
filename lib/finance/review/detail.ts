import type { Tx } from "@/lib/db";
import type { Certification } from "@/lib/rules/certify";
import type { Answers, BudgetLine, FormDefinition } from "@/lib/rules/types";
import { finishRow } from "./derive";
import type { OpenFlag, ReportRow, Sponsor } from "./types";
import { isUuid } from "@/lib/ids";

export type AttachmentRow = {
  id: string;
  filename: string;
  bytes: number;
  mime: string;
  createdAt: string;
  uploadedBy: string | null;
};

export type FlagRecord = {
  id: string;
  kind: string;
  source: string;
  note: string | null;
  status: string;
  createdAt: string;
  createdBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

export type AuditRecord = {
  id: number;
  at: string;
  actor: string | null;
  action: string;
  note: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  aiActionId: string | null;
  aiMode: string | null;
};

type RevisionFile = { path: string; filename: string; bytes: number };

export type RevisionRecord = {
  id: number;
  revision: number;
  kind: string;
  actor: string;
  reason: string | null;
  createdAt: string;
  sha256: string;
  files: RevisionFile[];
};

export type SubmissionDetail = {
  row: ReportRow;
  periodLabel: string;
  submittedBy: string | null;
  primaryContact: { name: string; email: string } | null;
  attachments: AttachmentRow[];
  flags: FlagRecord[];
  audit: AuditRecord[];
  revisions: RevisionRecord[];
  certification: Certification | null;
  fileIds: Record<string, string>;
  earlier: { label: string; served: number } | null;
};

const ISO = (column: string) => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export async function loadSubmissionDetail(tx: Tx, id: string): Promise<SubmissionDetail | null> {
  if (!isUuid(id)) return null;
  const base = await tx.one<{
    assignment_id: string;
    org_id: string;
    legal_name: string;
    ein: string;
    borough: string;
    council_district: number | null;
    org_type: string;
    initiative_id: string;
    initiative_name: string;
    code: string;
    category: string;
    award: number;
    funding_source: string;
    agency: string | null;
    contract_status: string;
    contract_registered_on: string | null;
    contract_number: string | null;
    sponsors: Sponsor[] | null;
    period_id: string;
    period_label: string;
    due_on: string;
    reference_no: string;
    status: string;
    revision: number;
    lock_version: number;
    submitted_at: string | null;
    updated_at: string;
    form_version_id: string;
    submitted_by_name: string | null;
    definition: FormDefinition;
  }>(
    `SELECT a.id AS assignment_id, o.id AS org_id, o.legal_name, o.ein, o.borough, o.council_district, o.org_type, i.id AS initiative_id, i.name AS initiative_name, i.code, i.category,
            a.award_amount::float8 AS award, a.funding_source, a.sponsoring_agency AS agency, a.contract_status, a.contract_registered_on::text AS contract_registered_on, a.contract_number,
            (SELECT jsonb_agg(jsonb_build_object('district', sp.district, 'name', cm.full_name, 'amount', sp.amount::float8) ORDER BY sp.amount DESC, sp.district)
               FROM assignment_sponsor sp JOIN council_member cm ON cm.district = sp.district WHERE sp.assignment_id = a.id) AS sponsors,
            p.id AS period_id, p.label AS period_label, p.due_on::text AS due_on,
            s.reference_no, s.status, s.revision, s.lock_version, ${ISO("s.submitted_at")} AS submitted_at, ${ISO("s.updated_at")} AS updated_at,
            s.form_version_id, u.full_name AS submitted_by_name, f.definition
     FROM submission s
     JOIN assignment a ON a.id = s.assignment_id
     JOIN organization o ON o.id = a.org_id
     JOIN initiative i ON i.id = a.initiative_id
     JOIN reporting_period p ON p.id = s.period_id
     JOIN form_version f ON f.id = s.form_version_id
     LEFT JOIN app_user u ON u.id = s.submitted_by
     WHERE s.id = $1`,
    [id],
  );
  if (!base) return null;

  const answerRows = await tx.query<{ question_key: string; value: Answers[string] }>(
    "SELECT question_key, value FROM answer WHERE submission_id = $1",
    [id],
  );
  const budgetRows = await tx.query<{
    row_id: string;
    position: number;
    category: "PS" | "OTPS";
    description: string;
    amount: number;
    actual: number | null;
  }>(
    "SELECT row_id, position, category, description, amount::float8 AS amount, actual_spent::float8 AS actual FROM budget_line WHERE submission_id = $1 ORDER BY position",
    [id],
  );
  const flagRows = await tx.query<{
    id: string;
    kind: string;
    source: string;
    note: string | null;
    status: string;
    created_at: string;
    created_by: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
  }>(
    `SELECT f.id, f.kind, f.source, f.note, f.status, ${ISO("f.created_at")} AS created_at, c.full_name AS created_by, ${ISO("f.resolved_at")} AS resolved_at, r.full_name AS resolved_by
       FROM flag f LEFT JOIN app_user c ON c.id = f.created_by LEFT JOIN app_user r ON r.id = f.resolved_by
       WHERE f.submission_id = $1 ORDER BY f.created_at`,
    [id],
  );
  const attachmentRows = await tx.query<{
    id: string;
    filename: string;
    bytes: string;
    mime: string;
    created_at: string;
    uploaded_by: string | null;
  }>(
    `SELECT t.id, t.filename, t.bytes::text AS bytes, t.mime, ${ISO("t.created_at")} AS created_at, u.full_name AS uploaded_by
       FROM attachment t LEFT JOIN app_user u ON u.id = t.uploaded_by WHERE t.submission_id = $1 AND t.removed_at IS NULL ORDER BY t.created_at`,
    [id],
  );
  const auditRows = await tx.query<{
    id: string;
    at: string;
    actor: string | null;
    action: string;
    note: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    ai_action_id: string | null;
    ai_mode: string | null;
  }>(
    `SELECT e.id::text AS id, ${ISO("e.at")} AS at, u.full_name AS actor, e.action, e.note, e.before, e.after, e.ai_action_id, ai.mode AS ai_mode
       FROM audit_event e LEFT JOIN app_user u ON u.id = e.actor_id LEFT JOIN ai_action ai ON ai.id = e.ai_action_id
       WHERE e.entity = 'submission' AND e.entity_id = $1 ORDER BY e.at, e.id`,
    [id],
  );
  const revisionRows = await tx.query<{
    id: string;
    revision: number;
    kind: string;
    actor: string;
    reason: string | null;
    created_at: string;
    sha256: string;
    files: RevisionFile[] | null;
  }>(
    `SELECT r.id::text AS id, r.revision, r.kind, u.full_name AS actor, r.reason, ${ISO("r.created_at")} AS created_at, r.sha256, r.snapshot -> 'attachments' AS files
       FROM submission_revision r JOIN app_user u ON u.id = r.actor WHERE r.submission_id = $1 ORDER BY r.revision, r.created_at`,
    [id],
  );
  const allFiles = await tx.query<{ id: string; path: string }>(
    "SELECT id, path FROM attachment WHERE submission_id = $1",
    [id],
  );
  const certified = await tx.one<{ certification: Certification | null }>(
    "SELECT snapshot -> 'certification' AS certification FROM submission_revision WHERE submission_id = $1 ORDER BY revision DESC, id DESC LIMIT 1",
    [id],
  );
  const earlier = await tx.one<{ label: string; value: Answers[string] }>(
    `SELECT p.label, an.value
     FROM submission s
     JOIN reporting_period p ON p.id = s.period_id
     JOIN answer an ON an.submission_id = s.id AND an.question_key = 'participants_actual'
     WHERE s.assignment_id = $1 AND s.status IN ('submitted', 'under_review', 'accepted')
       AND p.fiscal_year_id = (SELECT fiscal_year_id FROM reporting_period WHERE id = $2)
       AND p.due_on < (SELECT due_on FROM reporting_period WHERE id = $2)
     ORDER BY p.due_on DESC LIMIT 1`,
    [base.assignment_id, base.period_id],
  );
  const contact = await tx.one<{ full_name: string; email: string }>(
    "SELECT full_name, email FROM contact WHERE org_id = $1 ORDER BY is_primary DESC, full_name LIMIT 1",
    [base.org_id],
  );

  const answers: Answers = {};
  for (const a of answerRows) answers[a.question_key] = a.value;
  const budget: BudgetLine[] = budgetRows.map((b) => ({
    rowId: b.row_id,
    position: b.position,
    category: b.category,
    description: b.description,
    amount: b.amount,
    actual: b.actual,
  }));
  const openFlags: OpenFlag[] = flagRows
    .filter((f) => f.status === "open")
    .map((f) => ({ id: f.id, kind: f.kind, note: f.note }));

  const row = finishRow({
    assignmentId: base.assignment_id,
    orgId: base.org_id,
    orgName: base.legal_name,
    ein: base.ein,
    borough: base.borough,
    councilDistrict: base.council_district,
    orgType: base.org_type,
    initiativeId: base.initiative_id,
    initiativeName: base.initiative_name,
    initiativeCode: base.code,
    category: base.category,
    award: base.award,
    fundingSource: base.funding_source,
    agency: base.agency,
    contractStatus: base.contract_status,
    contractRegisteredOn: base.contract_registered_on,
    contractNumber: base.contract_number,
    sponsors: base.sponsors ?? [],
    periodId: base.period_id,
    dueOn: base.due_on,
    submissionId: id,
    referenceNo: base.reference_no,
    status: base.status,
    revision: base.revision,
    lockVersion: base.lock_version,
    submittedAt: base.submitted_at,
    updatedAt: base.updated_at,
    formVersionId: base.form_version_id,
    answers,
    budget,
    definition: base.definition,
    openFlags,
  });

  return {
    row,
    periodLabel: base.period_label,
    submittedBy: base.submitted_by_name,
    primaryContact: contact ? { name: contact.full_name, email: contact.email } : null,
    attachments: attachmentRows.map((a) => ({
      id: a.id,
      filename: a.filename,
      bytes: Number(a.bytes),
      mime: a.mime,
      createdAt: a.created_at,
      uploadedBy: a.uploaded_by,
    })),
    flags: flagRows.map((f) => ({
      id: f.id,
      kind: f.kind,
      source: f.source,
      note: f.note,
      status: f.status,
      createdAt: f.created_at,
      createdBy: f.created_by,
      resolvedAt: f.resolved_at,
      resolvedBy: f.resolved_by,
    })),
    audit: auditRows.map((e) => ({
      id: Number(e.id),
      at: e.at,
      actor: e.actor,
      action: e.action,
      note: e.note,
      before: e.before,
      after: e.after,
      aiActionId: e.ai_action_id,
      aiMode: e.ai_mode,
    })),
    certification: certified?.certification ?? null,
    earlier:
      earlier &&
      Number.isFinite(Number(String(earlier.value ?? "").replace(/,/g, ""))) &&
      String(earlier.value ?? "") !== ""
        ? { label: earlier.label, served: Number(String(earlier.value).replace(/,/g, "")) }
        : null,
    fileIds: Object.fromEntries(allFiles.map((f) => [f.path, f.id])),
    revisions: revisionRows.map((r) => ({
      id: Number(r.id),
      revision: r.revision,
      kind: r.kind,
      actor: r.actor,
      reason: r.reason,
      createdAt: r.created_at,
      sha256: r.sha256,
      files: r.files ?? [],
    })),
  };
}
