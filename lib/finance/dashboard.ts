import type { TimelineMark } from "@/components/ui/fiscal-year-timeline";
import { formatDate } from "@/lib/dates";
import { counted, formatCurrency } from "@/lib/format";
import type { PeriodInfo } from "@/lib/finance/review/types";

export function formatWholeDollars(value: number): string {
  return formatCurrency(value, { cents: false });
}

export function cycleTimeline(
  fiscalYearId: string,
  periods: PeriodInfo[],
): { startsOn: string; endsOn: string; marks: TimelineMark[] } {
  const end = 2000 + Number(fiscalYearId.replace(/\D/g, "").slice(-2));
  const startsOn = `${end - 1}-07-01`;
  const yearEnd = `${end}-06-30`;
  const own = periods.filter((p) => p.fiscalYearId === fiscalYearId).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const marks: TimelineMark[] = [{ date: startsOn, label: `${fiscalYearId} begins`, kind: "boundary" }];
  for (const p of own) {
    if (/Mid-Year/.test(p.label))
      marks.push({ date: `${end - 1}-12-31`, label: "Mid-Year period ends", kind: "period-end" });
    marks.push({ date: p.dueOn, label: `${p.label.replace(`${fiscalYearId} `, "")} due`, kind: "due" });
  }
  marks.push({ date: yearEnd, label: `${fiscalYearId} ends`, kind: "boundary" });
  const lastDue = own.at(-1)?.dueOn ?? yearEnd;
  return { startsOn, endsOn: lastDue > yearEnd ? lastDue : yearEnd, marks };
}

export function periodEyebrow(period: PeriodInfo) {
  const year = Number(period.fiscalYearId.replace(/\D/g, ""));
  const kind = period.label.replace(period.fiscalYearId, "").trim();
  return `Fiscal Year ${Number.isFinite(year) ? 2000 + year : period.fiscalYearId} · ${kind} reporting`;
}

export function dashboardHeadline(period: PeriodInfo, counts: Record<string, number>, total: number) {
  const due = formatDate(period.dueOn);
  const waiting = counts.submitted;
  const waitingLine =
    waiting === 0
      ? "No submitted reports are waiting for review."
      : `${counted(waiting, "submitted report is", "submitted reports are")} waiting for review.`;
  if (counts.missing > 0)
    return {
      title: `${counted(counts.missing, "report is", "reports are")} missing`,
      lede: `Due ${due}. ${waitingLine}`,
    };
  if (counts.outstanding > 0 && counts.outstanding === total)
    return {
      title: `${period.label} reports are due ${due}`,
      lede: `${counted(total, "report is", "reports are")} expected. Nothing is past due yet.`,
    };
  if (waiting > 0)
    return {
      title: `${counted(waiting, "report is", "reports are")} waiting for review`,
      lede: `${period.label} reports were due ${due}. Every report due has been submitted.`,
    };
  if (total > 0 && counts.accepted === total)
    return {
      title: `All ${period.label} reports are accepted`,
      lede: `${counted(total, "report was", "reports were")} due ${due}.`,
    };
  return {
    title: `${period.label} reporting`,
    lede: `${counted(total, "report is", "reports are")} due ${due}. ${waitingLine}`,
  };
}
