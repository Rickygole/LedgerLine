import type { Tx } from "@/lib/db";
import { ASSIGNMENT_STATE } from "./sql";
import { PAGE_SIZE, likePattern } from "./params";

export type InitiativeRow = {
  id: string;
  code: string;
  name: string;
  category: string;
  status: string;
  orgs: number;
  funding: string;
  accepted: number;
  missing: number;
  full_count: number;
};

export async function listInitiatives(tx: Tx, today: string, filters: { q: string; category: string; status: string; page: number }) {
  const rows = await tx.query<InitiativeRow>(
    `WITH ${ASSIGNMENT_STATE}
     SELECT i.id, i.code, i.name, i.category, i.status, i.total_funding AS funding,
            count(ay.id)::int AS orgs,
            count(ay.id) FILTER (WHERE ay.ye_status = 'accepted')::int AS accepted,
            count(ay.id) FILTER (WHERE ay.ye_missing)::int AS missing,
            count(*) OVER ()::int AS full_count
     FROM initiative i LEFT JOIN ay ON ay.initiative_id = i.id
     WHERE ($2 = '' OR i.name ILIKE $3 OR i.code ILIKE $3)
       AND ($4 = '' OR i.category = $4)
       AND ($5 = '' OR i.status = $5)
     GROUP BY i.id
     ORDER BY i.code
     LIMIT ${PAGE_SIZE} OFFSET $6`,
    [today, filters.q, likePattern(filters.q), filters.category, filters.status, (filters.page - 1) * PAGE_SIZE]
  );
  return { rows, total: rows[0]?.full_count ?? 0 };
}

export async function categorySummary(tx: Tx, today: string) {
  return tx.query<{ category: string; initiatives: number; funding: string; accepted: number; assignments: number; missing: number }>(
    `WITH ${ASSIGNMENT_STATE},
     per_cat AS (
       SELECT i.category, count(*)::int AS initiatives, sum(i.total_funding) AS funding FROM initiative i GROUP BY i.category
     ),
     per_assign AS (
       SELECT i.category,
              count(ay.id)::int AS assignments,
              count(ay.id) FILTER (WHERE ay.ye_status = 'accepted')::int AS accepted,
              count(ay.id) FILTER (WHERE ay.ye_missing)::int AS missing
       FROM initiative i JOIN ay ON ay.initiative_id = i.id GROUP BY i.category
     )
     SELECT c.category, c.initiatives, c.funding, coalesce(a.accepted, 0) AS accepted, coalesce(a.assignments, 0) AS assignments, coalesce(a.missing, 0) AS missing
     FROM per_cat c LEFT JOIN per_assign a ON a.category = c.category
     ORDER BY c.category`,
    [today]
  );
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
};

export type FundedOrg = {
  assignment_id: string;
  org_id: string;
  legal_name: string;
  ein: string;
  borough: string;
  award_amount: string;
  sponsoring_agency: string | null;
  ye_status: string | null;
  mid_status: string | null;
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
    `SELECT id, code, name, category, description, fiscal_year_id, total_funding, status FROM initiative WHERE id = $1`,
    [id]
  );
  if (!initiative) return null;
  const funded = await tx.query<FundedOrg>(
    `SELECT a.id AS assignment_id, o.id AS org_id, o.legal_name, o.ein, o.borough, a.award_amount, a.sponsoring_agency,
            sy.status AS ye_status, sm.status AS mid_status
     FROM assignment a
     JOIN organization o ON o.id = a.org_id
     LEFT JOIN submission sy ON sy.assignment_id = a.id AND sy.period_id = 'FY26-YE'
     LEFT JOIN submission sm ON sm.assignment_id = a.id AND sm.period_id = 'FY27-MY'
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
  const periods = await tx.query<{ id: string; due_on: string }>(`SELECT id, due_on::text FROM reporting_period`);
  return { initiative, funded, forms, due: Object.fromEntries(periods.map((p) => [p.id, p.due_on])) as Record<string, string> };
}
