import type { Tx } from "@/lib/db";

type YearSummary = {
  id: string;
  initiatives: number;
  organizations: number;
  totalFunding: number;
  assignments: number;
};

export type RolloverInitiative = {
  id: string;
  code: string;
  name: string;
  category: string;
  funding: number;
  orgs: number;
  alreadyRolled: boolean;
};

export type PlanAction = "carry" | "rename" | "combine" | "retire";

type RolloverResult = {
  from: string;
  to: string;
  carried: number;
  renamed: number;
  combined: number;
  combinedPredecessors: number;
  retired: number;
  created: number;
  assignments: number;
  forms: number;
  periods: { id: string; label: string; due_on: string }[];
};

export function nextFiscalYear(id: string): string {
  const n = Number(id.replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? `FY${String(n + 1).padStart(2, "0")}` : "";
}

export function validFiscalYear(id: string): boolean {
  return /^FY\d{2}$/.test(id);
}

export async function fiscalYears(tx: Tx): Promise<string[]> {
  const rows = await tx.query<{ id: string }>("SELECT id FROM fiscal_year ORDER BY id");
  return rows.map((r) => r.id);
}

export async function yearSummary(tx: Tx, id: string): Promise<YearSummary> {
  const row = await tx.one<{ initiatives: number; organizations: number; assignments: number }>(
    `SELECT count(DISTINCT i.id)::int AS initiatives, count(DISTINCT a.org_id)::int AS organizations, count(a.id)::int AS assignments
     FROM initiative i LEFT JOIN assignment a ON a.initiative_id = i.id
     WHERE i.fiscal_year_id = $1 AND i.status = 'active'`,
    [id],
  );
  const funding = await tx.one<{ funding: string }>(
    "SELECT coalesce(sum(total_funding), 0)::text AS funding FROM initiative WHERE fiscal_year_id = $1 AND status = 'active'",
    [id],
  );
  return {
    id,
    initiatives: row?.initiatives ?? 0,
    organizations: row?.organizations ?? 0,
    totalFunding: Number(funding?.funding ?? 0),
    assignments: row?.assignments ?? 0,
  };
}

export async function rolloverInitiatives(tx: Tx, fiscalYear: string): Promise<RolloverInitiative[]> {
  const rows = await tx.query<{
    id: string;
    code: string;
    name: string;
    category: string;
    funding: string;
    orgs: number;
    rolled: boolean;
  }>(
    `SELECT i.id, i.code, i.name, i.category, i.total_funding::text AS funding,
            (SELECT count(*)::int FROM assignment a WHERE a.initiative_id = i.id) AS orgs,
            EXISTS (SELECT 1 FROM initiative_lineage l WHERE l.predecessor_id = i.id AND l.successor_id IS DISTINCT FROM l.predecessor_id) AS rolled
     FROM initiative i
     WHERE i.fiscal_year_id = $1 AND i.status = 'active'
     ORDER BY i.code`,
    [fiscalYear],
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    funding: Number(r.funding),
    orgs: r.orgs,
    alreadyRolled: r.rolled,
  }));
}

export async function rolloverResult(tx: Tx, from: string, to: string): Promise<RolloverResult | null> {
  const kinds = await tx.query<{ kind: string; n: number; successors: number }>(
    `SELECT l.kind, count(*)::int AS n, count(DISTINCT l.successor_id)::int AS successors
     FROM initiative_lineage l JOIN initiative p ON p.id = l.predecessor_id
     WHERE l.fiscal_year_id = $2 AND p.fiscal_year_id = $1
     GROUP BY l.kind`,
    [from, to],
  );
  if (kinds.length === 0) return null;
  const by = (kind: string) => kinds.find((k) => k.kind === kind);
  const totals = await tx.one<{ created: number; assignments: number; forms: number }>(
    `SELECT count(*)::int AS created,
            (SELECT count(*)::int FROM assignment a JOIN initiative n ON n.id = a.initiative_id WHERE n.fiscal_year_id = $1) AS assignments,
            (SELECT count(*)::int FROM form_version f JOIN initiative n ON n.id = f.initiative_id WHERE n.fiscal_year_id = $1) AS forms
     FROM initiative WHERE fiscal_year_id = $1`,
    [to],
  );
  const periods = await tx.query<{ id: string; label: string; due_on: string }>(
    "SELECT id, label, due_on::text FROM reporting_period WHERE fiscal_year_id = $1 ORDER BY due_on",
    [to],
  );
  return {
    from,
    to,
    carried: by("carried")?.n ?? 0,
    renamed: by("renamed")?.n ?? 0,
    combined: by("combined")?.successors ?? 0,
    combinedPredecessors: by("combined")?.n ?? 0,
    retired: by("retired")?.n ?? 0,
    created: totals?.created ?? 0,
    assignments: totals?.assignments ?? 0,
    forms: totals?.forms ?? 0,
    periods,
  };
}

export type LineageLink = {
  kind: "renamed" | "combined" | "carried" | "retired";
  fiscal_year_id: string;
  other_id: string | null;
  other_code: string | null;
  other_name: string | null;
  other_year: string | null;
};

export async function lineageFor(
  tx: Tx,
  initiativeId: string,
): Promise<{ predecessors: LineageLink[]; successors: LineageLink[] }> {
  const predecessors = await tx.query<LineageLink>(
    `SELECT l.kind, l.fiscal_year_id, p.id AS other_id, p.code AS other_code, p.name AS other_name, p.fiscal_year_id AS other_year
     FROM initiative_lineage l JOIN initiative p ON p.id = l.predecessor_id
     WHERE l.successor_id = $1 AND l.predecessor_id <> l.successor_id ORDER BY p.code`,
    [initiativeId],
  );
  const successors = await tx.query<LineageLink>(
    `SELECT l.kind, l.fiscal_year_id, s.id AS other_id, s.code AS other_code, s.name AS other_name, s.fiscal_year_id AS other_year
     FROM initiative_lineage l LEFT JOIN initiative s ON s.id = l.successor_id
     WHERE l.predecessor_id = $1 AND l.predecessor_id IS DISTINCT FROM l.successor_id ORDER BY s.code`,
    [initiativeId],
  );
  return { predecessors, successors };
}

export type ChangeRecord = {
  id: string;
  kind: "renamed" | "retired";
  note: string | null;
  created_at: string;
  by_name: string | null;
};

export async function changeHistory(tx: Tx, initiativeId: string): Promise<ChangeRecord[]> {
  return tx.query<ChangeRecord>(
    `SELECT l.id, l.kind, l.note, l.created_at::text, u.full_name AS by_name
     FROM initiative_lineage l LEFT JOIN app_user u ON u.id = l.created_by
     WHERE l.predecessor_id = $1 AND (l.kind = 'retired' OR l.successor_id = l.predecessor_id)
     ORDER BY l.created_at DESC, l.id`,
    [initiativeId],
  );
}

type LineageRow = {
  id: string;
  kind: "renamed" | "combined" | "carried" | "retired";
  fiscal_year_id: string;
  predecessor_id: string;
  predecessor_code: string;
  predecessor_name: string;
  predecessor_year: string;
  successor_id: string | null;
  successor_code: string | null;
  successor_name: string | null;
  successor_year: string | null;
  created_at: string;
};

export async function lineageRows(
  tx: Tx,
  filters: { kind: string; q: string; year: string },
  limit: number,
  offset: number,
) {
  const where = `
    WHERE ($1 = '' OR l.kind = $1)
      AND ($2 = '' OR p.name ILIKE $2 OR p.code ILIKE $2 OR s.name ILIKE $2 OR s.code ILIKE $2)
      AND ($3 = '' OR l.fiscal_year_id = $3)`;
  const like = filters.q ? `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : "";
  const params = [filters.kind, like, filters.year];
  const total = await tx.one<{ n: number }>(
    `SELECT count(*)::int AS n FROM initiative_lineage l JOIN initiative p ON p.id = l.predecessor_id LEFT JOIN initiative s ON s.id = l.successor_id ${where}`,
    params,
  );
  const rows = await tx.query<LineageRow>(
    `SELECT l.id, l.kind, l.fiscal_year_id, p.id AS predecessor_id, p.code AS predecessor_code, p.name AS predecessor_name, p.fiscal_year_id AS predecessor_year,
            s.id AS successor_id, s.code AS successor_code, s.name AS successor_name, s.fiscal_year_id AS successor_year, l.created_at::text
     FROM initiative_lineage l JOIN initiative p ON p.id = l.predecessor_id LEFT JOIN initiative s ON s.id = l.successor_id
     ${where}
     ORDER BY l.fiscal_year_id DESC, p.code, s.code
     LIMIT $4 OFFSET $5`,
    [...params, limit, offset],
  );
  return { rows, total: total?.n ?? 0 };
}

export async function lineageYears(tx: Tx): Promise<string[]> {
  const rows = await tx.query<{ fiscal_year_id: string }>(
    "SELECT DISTINCT fiscal_year_id FROM initiative_lineage ORDER BY fiscal_year_id DESC",
  );
  return rows.map((r) => r.fiscal_year_id);
}

export const KIND_LABEL: Record<string, string> = {
  carried: "Carried forward",
  renamed: "Renamed",
  combined: "Combined",
  retired: "Retired",
};
