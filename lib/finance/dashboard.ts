import { formatDate } from "@/lib/dates";
import type { PeriodInfo } from "@/lib/finance/review/types";

export function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

export function periodEyebrow(period: PeriodInfo) {
  const year = Number(period.fiscalYearId.replace(/\D/g, ""));
  const kind = period.label.replace(period.fiscalYearId, "").trim();
  return `Fiscal Year ${Number.isFinite(year) ? 2000 + year : period.fiscalYearId} · ${kind} reporting`;
}

export function dashboardHeadline(period: PeriodInfo, counts: Record<string, number>, total: number) {
  const due = formatDate(period.dueOn);
  const waiting = counts.submitted;
  const waitingLine = waiting === 0 ? "No submitted reports are waiting for review." : `${plural(waiting, "submitted report is", "submitted reports are")} waiting for review.`;
  if (counts.missing > 0) return { title: `${plural(counts.missing, "report is", "reports are")} missing`, lede: `${period.label} reports were due ${due}. ${waitingLine}` };
  if (counts.outstanding > 0 && counts.outstanding === total) return { title: `${period.label} reports are due ${due}`, lede: `${plural(total, "report is", "reports are")} expected. Nothing is past due yet.` };
  if (waiting > 0) return { title: `${plural(waiting, "report is", "reports are")} waiting for review`, lede: `${period.label} reports were due ${due}. Every report due has been submitted.` };
  if (total > 0 && counts.accepted === total) return { title: `All ${period.label} reports are accepted`, lede: `${plural(total, "report was", "reports were")} due ${due}.` };
  return { title: `${period.label} reporting`, lede: `${plural(total, "report is", "reports are")} due ${due}. ${waitingLine}` };
}
