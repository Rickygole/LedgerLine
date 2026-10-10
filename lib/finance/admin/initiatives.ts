import type { Tx } from "@/lib/db";
import type { Sponsor } from "@/lib/finance/review/types";
import { ASSIGNMENT_STATE, PERIODS_SQL, SPONSORS_SQL } from "./sql";
import { PAGE_SIZE, likePattern } from "./params";

type InitiativeRow = {
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
  form_version: number | null;
  form_status: "published" | "draft" | null;
  full_count: number;
};

type InitiativeFilters = { q: string; category: string; status: string; agency: string; page: number; form?: string };

export async function listInitiatives(tx: Tx, today: string, periodId: string, filters: InitiativeFilters) {
  const rows = await tx.query<InitiativeRow>(
    `WITH ${ASSIGNMENT_STATE}
     SELECT i.id, i.code, i.name, i.category, i.status, i.administering_agency AS agency, i.total_funding AS funding,
            count(ay.id)::int AS orgs,
            count(ay.id) FILTER (WHERE ay.period_status = 'accepted')::int AS accepted,
            count(ay.id) FILTER (WHERE ay.is_missing)::int AS missing,
            fv.version AS form_version, fv.status AS form_status,
            count(*) OVER ()::int AS full_count
     FROM initiative i
     LEFT JOIN LATERAL (
       SELECT f.version, f.status FROM form_version f WHERE f.initiative_id = i.id AND f.status IN ('published', 'draft')
       ORDER BY (f.status = 'published') DESC, f.version DESC LIMIT 1
     ) fv ON true
     JOIN reporting_period rp ON rp.id = $2 AND rp.fiscal_year_id = i.fiscal_year_id
     LEFT JOIN ay ON ay.initiative_id = i.id
     WHERE ($3 = '' OR i.name ILIKE $4 OR i.code ILIKE $4)
       AND ($5 = '' OR i.category = $5)
       AND ($6 = '' OR i.status = $6)
       AND ($7 = '' OR i.administering_agency = $7)
       AND ($9 = '' OR ($9 = 'none' AND NOT EXISTS (SELECT 1 FROM form_version p WHERE p.initiative_id = i.id AND p.status = 'published'))
                    OR ($9 = 'draft' AND EXISTS (SELECT 1 FROM form_version d WHERE d.initiative_id = i.id AND d.status = 'draft'))
                    OR ($9 = 'published' AND EXISTS (SELECT 1 FROM form_version p WHERE p.initiative_id = i.id AND p.status = 'published')))
     GROUP BY i.id, fv.version, fv.status
     ORDER BY i.code
     LIMIT ${PAGE_SIZE} OFFSET $8`,
    [today, periodId, filters.q, likePattern(filters.q), filters.category, filters.status, filters.agency, (filters.page - 1) * PAGE_SIZE, filters.form ?? ""]
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

export async function nextInitiativeCode(tx: Tx, fiscalYearId: string): Promise<string> {
  const row = await tx.one<{ next: number }>(
    `SELECT coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 AS next FROM initiative WHERE code ~ '^CI-[0-9]{2}-[0-9]+$'`
  );
  return `CI-${fiscalYearId.replace(/\D/g, "")}-${String(row?.next ?? 1).padStart(3, "0")}`;
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

type FundedOrg = {
  assignment_id: string;
  org_id: string;
  legal_name: string;
  ein: string;
  borough: string;
  council_district: number | null;
  award_amount: string;
  sponsoring_agency: string | null;
  funding_source: string;
  contract_status: string;
  contract_number: string | null;
  contract_registered_on: string | null;
  sponsors: Sponsor[] | null;
  periods: AwardPeriod[] | null;
};

type FormVersionRow = {
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
    `SELECT a.id AS assignment_id, o.id AS org_id, o.legal_name, o.ein, o.borough, o.council_district, a.award_amount, a.sponsoring_agency,
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

export type SetupStatus = {
  fiscalYear: { id: string; startsOn: string; endsOn: string } | null;
  previousYear: string | null;
  total: number;
  carried: number;
  carriedOn: string | null;
  created: number;
  createdWithoutOrgs: number;
  needForm: number;
  firstNeedForm: string | null;
  noOrgs: number;
  firstNoOrgs: string | null;
  awards: number;
  funding: number;
  midYear: { id: string; endsOn: string; dueOn: string } | null;
};

export async function setupStatus(tx: Tx, today: string): Promise<SetupStatus> {
  const fy = await tx.one<{ id: string; starts_on: string; ends_on: string }>(
    "SELECT id, starts_on::text, ends_on::text FROM fiscal_year WHERE starts_on <= $1::date AND ends_on >= $1::date ORDER BY starts_on DESC LIMIT 1",
    [today]
  );
  if (!fy) return { fiscalYear: null, previousYear: null, total: 0, carried: 0, carriedOn: null, created: 0, createdWithoutOrgs: 0, needForm: 0, firstNeedForm: null, noOrgs: 0, firstNoOrgs: null, awards: 0, funding: 0, midYear: null };
  const prev = await tx.one<{ id: string }>("SELECT id FROM fiscal_year WHERE ends_on < $1::date ORDER BY ends_on DESC LIMIT 1", [fy.starts_on]);
  const counts = await tx.one<{ total: number; carried: number; carried_on: string | null; created: number; created_no_orgs: number; need_form: number; first_need_form: string | null; no_orgs: number; first_no_orgs: string | null; awards: number; funding: string }>(
    `WITH fyi AS (
       SELECT i.id, i.code, i.status,
              EXISTS (SELECT 1 FROM initiative_lineage l WHERE l.successor_id = i.id) AS carried,
              EXISTS (SELECT 1 FROM form_version f WHERE f.initiative_id = i.id AND f.status = 'published') AS has_form,
              (SELECT count(*) FROM assignment a WHERE a.initiative_id = i.id)::int AS awards,
              (SELECT coalesce(sum(a.award_amount), 0) FROM assignment a WHERE a.initiative_id = i.id) AS funding
       FROM initiative i WHERE i.fiscal_year_id = $1
     )
     SELECT count(*)::int AS total,
            count(*) FILTER (WHERE carried)::int AS carried,
            (SELECT min(l.created_at)::date::text FROM initiative_lineage l WHERE l.fiscal_year_id = $1) AS carried_on,
            count(*) FILTER (WHERE NOT carried)::int AS created,
            count(*) FILTER (WHERE NOT carried AND awards = 0)::int AS created_no_orgs,
            count(*) FILTER (WHERE status = 'active' AND NOT has_form)::int AS need_form,
            (array_agg(id ORDER BY code) FILTER (WHERE status = 'active' AND NOT has_form))[1]::text AS first_need_form,
            count(*) FILTER (WHERE status = 'active' AND awards = 0)::int AS no_orgs,
            (array_agg(id ORDER BY code) FILTER (WHERE status = 'active' AND awards = 0))[1]::text AS first_no_orgs,
            coalesce(sum(awards), 0)::int AS awards,
            coalesce(sum(funding), 0)::text AS funding
     FROM fyi`,
    [fy.id]
  );
  const mid = await tx.one<{ id: string; ends_on: string; due_on: string }>(
    "SELECT id, ends_on::text, due_on::text FROM reporting_period WHERE fiscal_year_id = $1 ORDER BY due_on LIMIT 1",
    [fy.id]
  );
  return {
    fiscalYear: { id: fy.id, startsOn: fy.starts_on, endsOn: fy.ends_on },
    previousYear: prev?.id ?? null,
    total: counts?.total ?? 0,
    carried: counts?.carried ?? 0,
    carriedOn: counts?.carried_on ?? null,
    created: counts?.created ?? 0,
    createdWithoutOrgs: counts?.created_no_orgs ?? 0,
    needForm: counts?.need_form ?? 0,
    firstNeedForm: counts?.first_need_form ?? null,
    noOrgs: counts?.no_orgs ?? 0,
    firstNoOrgs: counts?.first_no_orgs ?? null,
    awards: counts?.awards ?? 0,
    funding: Number(counts?.funding ?? 0),
    midYear: mid ? { id: mid.id, endsOn: mid.ends_on, dueOn: mid.due_on } : null,
  };
}
