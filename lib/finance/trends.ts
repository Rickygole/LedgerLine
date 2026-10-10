import type { Tx } from "@/lib/db";

export type TrendFilters = { category: string; borough: string; period: string; compare: "category" | "borough" };

export type MonthPoint = { month: string; label: string; onTime: number; late: number; total: number };
export type GroupPoint = { name: string; due: number; submitted: number; accepted: number; share: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  return `${MONTHS[Number(number) - 1]} ${year}`;
}

export function fillMonths(points: { month: string; onTime: number; late: number }[]): MonthPoint[] {
  if (points.length === 0) return [];
  const byMonth = new Map(points.map((p) => [p.month, p]));
  const first = points[0].month;
  const last = points[points.length - 1].month;
  const out: MonthPoint[] = [];
  let [year, month] = first.split("-").map(Number);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const point = byMonth.get(key);
    out.push({ month: key, label: monthLabel(key), onTime: point?.onTime ?? 0, late: point?.late ?? 0, total: (point?.onTime ?? 0) + (point?.late ?? 0) });
    if (key === last) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

export function sharePercent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

export async function monthlySubmissions(tx: Tx, filters: Pick<TrendFilters, "category" | "borough">): Promise<MonthPoint[]> {
  const rows = await tx.query<{ month: string; on_time: number; late: number }>(
    `SELECT to_char(s.submitted_at AT TIME ZONE 'America/New_York', 'YYYY-MM') AS month,
            count(*) FILTER (WHERE (s.submitted_at AT TIME ZONE 'America/New_York')::date <= rp.due_on)::int AS on_time,
            count(*) FILTER (WHERE (s.submitted_at AT TIME ZONE 'America/New_York')::date > rp.due_on)::int AS late
     FROM submission s
     JOIN assignment a ON a.id = s.assignment_id
     JOIN initiative i ON i.id = a.initiative_id
     JOIN organization o ON o.id = a.org_id
     JOIN reporting_period rp ON rp.id = s.period_id
     WHERE s.submitted_at IS NOT NULL AND ($1 = '' OR i.category = $1) AND ($2 = '' OR o.borough = $2)
     GROUP BY 1 ORDER BY 1`,
    [filters.category, filters.borough]
  );
  return fillMonths(rows.map((r) => ({ month: r.month, onTime: r.on_time, late: r.late })));
}

export async function submissionShareByGroup(tx: Tx, filters: TrendFilters): Promise<GroupPoint[]> {
  const column = filters.compare === "borough" ? "o.borough" : "i.category";
  const rows = await tx.query<{ name: string; due: number; submitted: number; accepted: number }>(
    `SELECT ${column} AS name, count(*)::int AS due,
            count(*) FILTER (WHERE ob.submission_status IN ('submitted', 'under_review', 'accepted'))::int AS submitted,
            count(*) FILTER (WHERE ob.submission_status = 'accepted')::int AS accepted
     FROM obligation ob
     JOIN assignment a ON a.id = ob.assignment_id
     JOIN initiative i ON i.id = a.initiative_id
     JOIN organization o ON o.id = a.org_id
     WHERE ob.period_id = $1 AND ($2 = '' OR i.category = $2) AND ($3 = '' OR o.borough = $3)
     GROUP BY 1 ORDER BY 1`,
    [filters.period, filters.category, filters.borough]
  );
  return rows.map((r) => ({ ...r, share: sharePercent(r.submitted, r.due) })).sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
}
