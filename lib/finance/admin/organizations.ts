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
