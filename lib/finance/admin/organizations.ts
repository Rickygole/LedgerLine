import type { Tx } from "@/lib/db";
import type { Sponsor } from "@/lib/finance/review/types";
import { ASSIGNMENT_STATE, PERIODS_SQL, SPONSORS_SQL } from "./sql";
import type { AwardPeriod } from "./initiatives";
import { PAGE_SIZE, likePattern } from "./params";

export const ORG_SORTS = {
  name: "legal_name",
  ein: "ein",
  type: "org_type",
  borough: "borough",
  district: "council_district",
  awards: "awards",
  total: "total",
  compliance: "accepted",
  missing: "missing",
} as const;

export type OrgSort = keyof typeof ORG_SORTS;

export type OrgRow = {
  id: string;
  legal_name: string;
  ein: string;
  org_type: string;
  borough: string;
  council_district: number | null;
  awards: number;
  total: string;
  accepted: number;
  missing: number;
  full_count: number;
};

export async function listOrganizations(tx: Tx, today: string, periodId: string, filters: { q: string; borough: string; type: string; missing: boolean; sort: OrgSort; dir: "asc" | "desc"; page: number }) {
  const direction = filters.dir === "desc" ? "DESC" : "ASC";
  const orderBy = `${ORG_SORTS[filters.sort]} ${direction} NULLS LAST, legal_name ASC, id ASC`;
  const rows = await tx.query<OrgRow>(
    `WITH ${ASSIGNMENT_STATE},
     agg AS (
       SELECT o.id, o.legal_name, o.ein, o.org_type, o.borough, o.council_district,
              count(ay.id)::int AS awards,
              coalesce(sum(ay.award_amount), 0) AS total,
              count(ay.id) FILTER (WHERE ay.period_status = 'accepted')::int AS accepted,
              count(ay.id) FILTER (WHERE ay.is_missing)::int AS missing
       FROM organization o LEFT JOIN ay ON ay.org_id = o.id
       WHERE ($3 = '' OR o.legal_name ILIKE $4 OR o.ein ILIKE $4)
         AND ($5 = '' OR o.borough = $5)
         AND ($6 = '' OR o.org_type = $6)
       GROUP BY o.id
     )
     SELECT *, count(*) OVER ()::int AS full_count FROM agg
     WHERE (NOT $7::boolean OR missing > 0)
     ORDER BY ${orderBy}
     LIMIT ${PAGE_SIZE} OFFSET $8`,
    [today, periodId, filters.q, likePattern(filters.q), filters.borough, filters.type, filters.missing, (filters.page - 1) * PAGE_SIZE]
  );
  return { rows, total: rows[0]?.full_count ?? 0 };
}

export type OrgProfile = {
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
};

export type OrgAward = {
  assignment_id: string;
  initiative_id: string;
  code: string;
  name: string;
  category: string;
  initiative_status: string;
  fiscal_year_id: string;
  award_amount: string;
  sponsoring_agency: string | null;
  funding_source: string;
  contract_status: string;
  contract_number: string | null;
  contract_registered_on: string | null;
  sponsors: Sponsor[] | null;
  periods: AwardPeriod[] | null;
};

type OrgReport = {
  id: string;
  reference_no: string;
  period_id: string;
  period_label: string;
  due_on: string;
  status: string;
  revision: number;
  initiative_code: string;
  initiative_name: string;
  submitted_at: string | null;
  submitted_by_name: string | null;
};

export async function loadOrganization(tx: Tx, orgId: string) {
  const org = await tx.one<OrgProfile>(
    `SELECT id, ein, legal_name, dba_name, org_type, borough, council_district, address_line, city, state, postal_code, phone, website, mission, founded_year, annual_budget
     FROM organization WHERE id = $1`,
    [orgId]
  );
  if (!org) return null;
  const awards = await tx.query<OrgAward>(
    `SELECT a.id AS assignment_id, i.id AS initiative_id, i.code, i.name, i.category, i.status AS initiative_status, i.fiscal_year_id, a.award_amount, a.sponsoring_agency,
            a.funding_source, a.contract_status, a.contract_number, a.contract_registered_on::text AS contract_registered_on,
            ${SPONSORS_SQL} AS sponsors,
            ${PERIODS_SQL} AS periods
     FROM assignment a
     JOIN initiative i ON i.id = a.initiative_id
     WHERE a.org_id = $1
     ORDER BY i.fiscal_year_id DESC, i.code`,
    [orgId]
  );
  const reports = await tx.query<OrgReport>(
    `SELECT s.id, s.reference_no, s.period_id, p.label AS period_label, p.due_on::text AS due_on, s.status, s.revision, i.code AS initiative_code, i.name AS initiative_name,
            s.submitted_at, u.full_name AS submitted_by_name
     FROM submission s
     JOIN assignment a ON a.id = s.assignment_id
     JOIN initiative i ON i.id = a.initiative_id
     JOIN reporting_period p ON p.id = s.period_id
     LEFT JOIN app_user u ON u.id = s.submitted_by
     WHERE a.org_id = $1
     ORDER BY p.due_on DESC, i.code`,
    [orgId]
  );
  const contacts = await tx.query<{ id: string; full_name: string; title: string; email: string; phone: string | null; is_primary: boolean }>(
    `SELECT id, full_name, title, email, phone, is_primary FROM contact WHERE org_id = $1 ORDER BY is_primary DESC, full_name`,
    [orgId]
  );
  const team = await tx.query<{ id: string; full_name: string; title: string | null; email: string; role: string; active: boolean; can_sign_in: boolean }>(
    `SELECT id, full_name, title, email, role, active, can_sign_in FROM app_user WHERE org_id = $1 ORDER BY full_name`,
    [orgId]
  );
  const messages = await tx.query<{ id: string; to_email: string; template: string; subject: string; status: string; created_at: string }>(
    `SELECT id, to_email, template, subject, status, created_at FROM outbox WHERE org_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [orgId]
  );
  return { org, awards, reports, contacts, team, messages };
}
