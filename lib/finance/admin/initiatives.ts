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
