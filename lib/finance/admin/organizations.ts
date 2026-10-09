import type { Tx } from "@/lib/db";
import { ASSIGNMENT_STATE } from "./sql";
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

export async function listOrganizations(tx: Tx, today: string, filters: { q: string; borough: string; type: string; missing: boolean; sort: OrgSort; dir: "asc" | "desc"; page: number }) {
  const direction = filters.dir === "desc" ? "DESC" : "ASC";
  const orderBy = `${ORG_SORTS[filters.sort]} ${direction} NULLS LAST, legal_name ASC`;
  const rows = await tx.query<OrgRow>(
    `WITH ${ASSIGNMENT_STATE},
     agg AS (
       SELECT o.id, o.legal_name, o.ein, o.org_type, o.borough, o.council_district,
              count(ay.id) FILTER (WHERE ay.initiative_status = 'active')::int AS awards,
              coalesce(sum(ay.award_amount) FILTER (WHERE ay.initiative_status = 'active'), 0) AS total,
              count(ay.id) FILTER (WHERE ay.initiative_status = 'active' AND ay.ye_status = 'accepted')::int AS accepted,
              count(ay.id) FILTER (WHERE ay.initiative_status = 'active' AND ay.ye_missing)::int AS missing
       FROM organization o LEFT JOIN ay ON ay.org_id = o.id
       WHERE ($2 = '' OR o.legal_name ILIKE $3 OR o.ein ILIKE $3)
         AND ($4 = '' OR o.borough = $4)
         AND ($5 = '' OR o.org_type = $5)
       GROUP BY o.id
     )
     SELECT *, count(*) OVER ()::int AS full_count FROM agg
     WHERE (NOT $6::boolean OR missing > 0)
     ORDER BY ${orderBy}
     LIMIT ${PAGE_SIZE} OFFSET $7`,
    [today, filters.q, likePattern(filters.q), filters.borough, filters.type, filters.missing, (filters.page - 1) * PAGE_SIZE]
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
  award_amount: string;
  sponsoring_agency: string | null;
  ye_id: string | null;
  ye_status: string | null;
  mid_id: string | null;
  mid_status: string | null;
};

export type OrgReport = {
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
    `SELECT a.id AS assignment_id, i.id AS initiative_id, i.code, i.name, i.category, i.status AS initiative_status, a.award_amount, a.sponsoring_agency,
            sy.id AS ye_id, sy.status AS ye_status, sm.id AS mid_id, sm.status AS mid_status
     FROM assignment a
     JOIN initiative i ON i.id = a.initiative_id
     LEFT JOIN submission sy ON sy.assignment_id = a.id AND sy.period_id = 'FY26-YE'
     LEFT JOIN submission sm ON sm.assignment_id = a.id AND sm.period_id = 'FY27-MY'
     WHERE a.org_id = $1
     ORDER BY i.code`,
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
  const periods = await tx.query<{ id: string; label: string; due_on: string }>(`SELECT id, label, due_on::text FROM reporting_period`);
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
  return { org, awards, reports, periods, contacts, team, messages };
}
