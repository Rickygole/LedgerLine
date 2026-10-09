import type { Tx } from "@/lib/db";
import type { Sponsor } from "@/lib/finance/review/types";
import { ASSIGNMENT_STATE, PERIODS_SQL, SPONSORS_SQL } from "./sql";
import { PAGE_SIZE, likePattern } from "./params";

export type InitiativeRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  status: string;
  agency: string | null;
  orgs: number;
  funding: string;
  accepted: number;
  missing: number;
  full_count: number;
};

export type InitiativeFilters = { q: string; category: string; status: string; agency: string; page: number };

export async function listInitiatives(tx: Tx, today: string, periodId: string, filters: InitiativeFilters) {
  const rows = await tx.query<InitiativeRow>(
    `WITH ${ASSIGNMENT_STATE}
     SELECT i.id, i.code, i.name, i.category, i.status, i.administering_agency AS agency, i.total_funding AS funding,
            count(ay.id)::int AS orgs,
            count(ay.id) FILTER (WHERE ay.period_status = 'accepted')::int AS accepted,
            count(ay.id) FILTER (WHERE ay.is_missing)::int AS missing,
            count(*) OVER ()::int AS full_count
     FROM initiative i
     JOIN reporting_period rp ON rp.id = $2 AND rp.fiscal_year_id = i.fiscal_year_id
     LEFT JOIN ay ON ay.initiative_id = i.id
     WHERE ($3 = '' OR i.name ILIKE $4 OR i.code ILIKE $4)
       AND ($5 = '' OR i.category = $5)
       AND ($6 = '' OR i.status = $6)
       AND ($7 = '' OR i.administering_agency = $7)
     GROUP BY i.id
     ORDER BY i.code
     LIMIT ${PAGE_SIZE} OFFSET $8`,
    [today, periodId, filters.q, likePattern(filters.q), filters.category, filters.status, filters.agency, (filters.page - 1) * PAGE_SIZE]
  );
  return { rows, total: rows[0]?.full_count ?? 0 };
}

export async function categorySummary(tx: Tx, today: string, periodId: string) {
  return tx.query<{ category: string; initiatives: number; funding: string; accepted: number; assignments: number; missing: number }>(
    `WITH ${ASSIGNMENT_STATE},
     per_cat AS (
       SELECT i.category, count(*)::int AS initiatives, sum(i.total_funding) AS funding
       FROM initiative i JOIN reporting_period rp ON rp.id = $2 AND rp.fiscal_year_id = i.fiscal_year_id
       GROUP BY i.category
     ),
     per_assign AS (
       SELECT i.category,
              count(ay.id)::int AS assignments,
              count(ay.id) FILTER (WHERE ay.period_status = 'accepted')::int AS accepted,
              count(ay.id) FILTER (WHERE ay.is_missing)::int AS missing
       FROM initiative i JOIN ay ON ay.initiative_id = i.id GROUP BY i.category
     )
     SELECT c.category, c.initiatives, c.funding, coalesce(a.accepted, 0) AS accepted, coalesce(a.assignments, 0) AS assignments, coalesce(a.missing, 0) AS missing
     FROM per_cat c LEFT JOIN per_assign a ON a.category = c.category
     ORDER BY c.category`,
    [today, periodId]
  );
}

export async function listAgencies(tx: Tx) {
  const rows = await tx.query<{ agency: string }>(`SELECT DISTINCT administering_agency AS agency FROM initiative WHERE administering_agency IS NOT NULL ORDER BY 1`);
  return rows.map((r) => r.agency);
}

export async function listCategories(tx: Tx) {
  const rows = await tx.query<{ category: string }>(`SELECT DISTINCT category FROM initiative ORDER BY category`);
  return rows.map((r) => r.category);
}

export type InitiativeDetail = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string;
  fiscal_year_id: string;
  total_funding: string;
  status: string;
  administering_agency: string | null;
};

export type AwardPeriod = { id: string; label: string; due_on: string; status: string | null };

export type FundedOrg = {
  assignment_id: string;
  org_id: string;
  legal_name: string;
  ein: string;
  borough: string;
  award_amount: string;
  sponsoring_agency: string | null;
  funding_source: string;
  contract_status: string;
  contract_number: string | null;
  contract_registered_on: string | null;
  sponsors: Sponsor[] | null;
  periods: AwardPeriod[] | null;
};

export type FormVersionRow = {
  id: string;
  version: number;
  status: "draft" | "published" | "superseded";
  source: string;
  created_at: string;
  published_at: string | null;
  created_by_name: string | null;
  published_by_name: string | null;
};

export async function loadInitiative(tx: Tx, id: string) {
  const initiative = await tx.one<InitiativeDetail>(
    `SELECT id, code, name, category, description, fiscal_year_id, total_funding, status, administering_agency FROM initiative WHERE id = $1`,
    [id]
  );
  if (!initiative) return null;
  const funded = await tx.query<FundedOrg>(
    `SELECT a.id AS assignment_id, o.id AS org_id, o.legal_name, o.ein, o.borough, a.award_amount, a.sponsoring_agency,
            a.funding_source, a.contract_status, a.contract_number, a.contract_registered_on::text AS contract_registered_on,
            ${SPONSORS_SQL} AS sponsors,
            ${PERIODS_SQL} AS periods
     FROM assignment a
     JOIN organization o ON o.id = a.org_id
     WHERE a.initiative_id = $1
     ORDER BY o.legal_name`,
    [id]
  );
  const forms = await tx.query<FormVersionRow>(
    `SELECT f.id, f.version, f.status, f.source, f.created_at, f.published_at, cu.full_name AS created_by_name, pu.full_name AS published_by_name
     FROM form_version f
     LEFT JOIN app_user cu ON cu.id = f.created_by
     LEFT JOIN app_user pu ON pu.id = f.published_by
     WHERE f.initiative_id = $1
     ORDER BY f.version DESC`,
    [id]
  );
  return { initiative, funded, forms };
}
