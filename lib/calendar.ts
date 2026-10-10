import "server-only";
import { anonymous } from "@/lib/db";
import { todayInNewYork } from "@/lib/dates";

export type CalendarPeriod = { id: string; fiscalYearId: string; label: string; startsOn: string; endsOn: string; dueOn: string };
export type FiscalCalendar = {
  today: string;
  fiscalYear: { id: string; startsOn: string; endsOn: string };
  periods: CalendarPeriod[];
  source: "database" | "fallback";
};

type Row = { kind: string; id: string; fiscal_year_id: string; label: string; starts_on: string | Date; ends_on: string | Date; due_on: string | Date | null };

function iso(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function fiscalYearFor(today: string): { id: string; startsOn: string; endsOn: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const startYear = month >= 7 ? year : year - 1;
  return { id: `FY${String((startYear + 1) % 100).padStart(2, "0")}`, startsOn: `${startYear}-07-01`, endsOn: `${startYear + 1}-06-30` };
}

export function fallbackCalendar(today: string = todayInNewYork()): FiscalCalendar {
  const fy = fiscalYearFor(today);
  const start = Number(fy.startsOn.slice(0, 4));
  const prior = `FY${String(start % 100).padStart(2, "0")}`;
  return {
    today,
    fiscalYear: fy,
    source: "fallback",
    periods: [
      { id: `${prior}-YE`, fiscalYearId: prior, label: `${prior} Year-End`, startsOn: `${start - 1}-07-01`, endsOn: `${start}-06-30`, dueOn: `${start}-09-30` },
      { id: `${fy.id}-MY`, fiscalYearId: fy.id, label: `${fy.id} Mid-Year`, startsOn: fy.startsOn, endsOn: `${start}-12-31`, dueOn: `${start + 1}-01-31` },
      { id: `${fy.id}-YE`, fiscalYearId: fy.id, label: `${fy.id} Year-End`, startsOn: fy.startsOn, endsOn: fy.endsOn, dueOn: `${start + 1}-09-30` },
    ],
  };
}

export async function loadFiscalCalendar(today: string = todayInNewYork()): Promise<FiscalCalendar> {
  try {
    const rows = await anonymous<Row>("SELECT * FROM app.public_calendar($1::date)", [today]);
    const year = rows.find((r) => r.kind === "fiscal_year");
    if (!year) return fallbackCalendar(today);
    const periods = rows
      .filter((r) => r.kind === "period" && r.due_on)
      .map((r) => ({ id: r.id, fiscalYearId: r.fiscal_year_id, label: r.label, startsOn: iso(r.starts_on), endsOn: iso(r.ends_on), dueOn: iso(r.due_on as string | Date) }))
      .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    return { today, fiscalYear: { id: year.id, startsOn: iso(year.starts_on), endsOn: iso(year.ends_on) }, periods, source: "database" };
  } catch {
    return fallbackCalendar(today);
  }
}
