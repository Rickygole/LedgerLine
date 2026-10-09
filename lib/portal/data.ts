import type { Tx } from "@/lib/db";
import { daysPastDue } from "@/lib/dates";
import { reportState } from "@/lib/reporting";
import type { ReportState } from "@/components/ui/status-badge";

export type Obligation = {
  assignmentId: string;
  periodId: string;
  periodLabel: string;
  startsOn: string;
  endsOn: string;
  dueOn: string;
  initiativeCode: string;
  initiativeName: string;
  award: number;
  submissionId: string | null;
  referenceNo: string | null;
  status: string | null;
  revision: number | null;
  state: ReportState;
  pastDue: number;
  editedBy: string | null;
  editedAt: string | null;
  needsAction: boolean;
};

type ObligationRow = {
  assignment_id: string;
  period_id: string;
  period_label: string;
  starts_on: string;
  ends_on: string;
  due_on: string;
  code: string;
  name: string;
  award_amount: string;
  submission_id: string | null;
  reference_no: string | null;
  status: string | null;
  revision: number | null;
  edited_by: string | null;
  edited_at: string | null;
};

export async function loadObligations(tx: Tx, orgId: string): Promise<Obligation[]> {
  const rows = await tx.query<ObligationRow>(
    `SELECT a.id AS assignment_id, p.id AS period_id, p.label AS period_label,
            to_char(p.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(p.ends_on, 'YYYY-MM-DD') AS ends_on,
            to_char(p.due_on, 'YYYY-MM-DD') AS due_on,
            i.code, i.name, a.award_amount::text AS award_amount,
            s.id AS submission_id, s.reference_no, s.status, s.revision,
            COALESCE(eu.full_name, su.full_name) AS edited_by,
            COALESCE(s.updated_at, s.submitted_at) AS edited_at
     FROM obligation ob
     JOIN assignment a ON a.id = ob.assignment_id
     JOIN initiative i ON i.id = a.initiative_id
     JOIN reporting_period p ON p.id = ob.period_id
     LEFT JOIN submission s ON s.id = ob.submission_id
     LEFT JOIN app_user eu ON eu.id = s.updated_by
     LEFT JOIN app_user su ON su.id = COALESCE(s.started_by, s.submitted_by)
     WHERE a.org_id = $1
     ORDER BY p.due_on, i.name`,
    [orgId]
  );
  const list = rows.map<Obligation>((row) => {
    const state = reportState(row.status, row.due_on);
    return {
      assignmentId: row.assignment_id,
      periodId: row.period_id,
      periodLabel: row.period_label,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      dueOn: row.due_on,
      initiativeCode: row.code,
      initiativeName: row.name,
      award: Number(row.award_amount),
      submissionId: row.submission_id,
      referenceNo: row.reference_no,
      status: row.status,
      revision: row.revision,
      state,
      pastDue: daysPastDue(row.due_on),
      editedBy: row.edited_by,
      editedAt: row.edited_at,
      needsAction: state === "missing" || state === "returned",
    };
  });
  return list.sort((a, b) => rank(a) - rank(b) || a.dueOn.localeCompare(b.dueOn) || a.initiativeName.localeCompare(b.initiativeName));
}

function rank(o: Obligation): number {
  if (o.state === "missing") return 0;
  if (o.state === "returned") return 1;
  if (o.state === "draft" || o.state === "not_started") return 2;
  if (o.state === "submitted" || o.state === "under_review") return 3;
  return 4;
}

export function actionFor(o: Obligation): { label: string; href: string; primary: boolean } {
  if (!o.submissionId) return { label: "Start report", href: `/portal/reports/new?assignment=${o.assignmentId}&period=${o.periodId}`, primary: true };
  const href = `/portal/reports/${o.submissionId}`;
  if (o.status === "draft") return { label: "Continue", href, primary: true };
  if (o.status === "returned") return { label: "Update report", href, primary: true };
  return { label: "View", href, primary: false };
}

export type OrgProfile = {
  id: string;
  ein: string;
  legalName: string;
  dbaName: string | null;
  orgType: string;
  borough: string;
  councilDistrict: number | null;
  address: string;
  phone: string | null;
  website: string | null;
  mission: string | null;
  foundedYear: number | null;
  annualBudget: number | null;
};

export async function loadOrganization(tx: Tx, orgId: string): Promise<OrgProfile | null> {
  const row = await tx.one<{
    id: string;
    ein: string;
    legal_name: string;
    dba_name: string | null;
    org_type: string;
    borough: string;
    council_district: number | null;
    address_line: string;
    city: string;
    state: string;
    postal_code: string;
    phone: string | null;
    website: string | null;
    mission: string | null;
    founded_year: number | null;
    annual_budget: string | null;
  }>(`SELECT * FROM organization WHERE id = $1`, [orgId]);
  if (!row) return null;
  return {
    id: row.id,
    ein: row.ein,
    legalName: row.legal_name,
    dbaName: row.dba_name,
    orgType: row.org_type,
    borough: row.borough,
    councilDistrict: row.council_district,
    address: `${row.address_line}, ${row.city}, ${row.state} ${row.postal_code}`,
    phone: row.phone,
    website: row.website,
    mission: row.mission,
    foundedYear: row.founded_year,
    annualBudget: row.annual_budget === null ? null : Number(row.annual_budget),
  };
}

export function orgTypeLabel(value: string): string {
  return value === "cbo" ? "Community-based organization" : "Agency";
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "In progress",
  submitted: "Submitted",
  under_review: "In review",
  returned: "Changes requested",
  accepted: "Accepted",
};
