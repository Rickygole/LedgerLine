import type { Metadata } from "next";
import { NoPeriods } from "@/components/finance/no-periods";
import Link from "next/link";
import { Flag } from "lucide-react";
import { ActiveChips, type Chip } from "@/components/finance/review/list-controls";
import { Pagination } from "@/components/finance/review/pagination";
import { SubmissionFilters } from "@/components/finance/review/submission-filters";
import { orgMeta } from "@/components/finance/review/submissions-table";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { withClaims } from "@/lib/db";
import { loadCouncilMembers } from "@/lib/finance/district-stats";
import { loadFilterOptions, loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { applyFilters, numberAnswer, paginate, sortRows } from "@/lib/finance/review/derive";
import { FLAG_LABEL, FLAG_ORDER, hrefWith, parseFilters } from "@/lib/finance/review/filters";
import type { FlagReason, ReportRow } from "@/lib/finance/review/types";
import { formatCount, formatCurrency, plural } from "@/lib/format";
import { budgetTotals, visibleAnswers } from "@/lib/rules/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Flagged items" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EXPLAIN: Record<FlagReason, string> = {
  unbalanced: "Draft or returned reports whose budget total does not equal the award.",
  incomplete: "Past due drafts or returned reports that still fail required rules. These reports are also counted as Missing or Update requested.",
  missing: "Past the due date with nothing submitted, or only a draft saved.",
  validation: "Submitted reports that fail one or more validation rules.",
  zero_outcomes: "Submitted reports that served no participants.",
  low_outcomes: "Submitted reports that served fewer than 40 percent of the target.",
  manual: "Flags added by Finance staff that are still open.",
};

const PAGE = 25;

function Meter({ ratio, tick, tone }: { ratio: number; tick?: number; tone: "bad" | "warn" }) {
  return (
    <span aria-hidden="true" className="relative inline-block h-2 w-20 shrink-0 overflow-visible rounded-sm bg-harbor-100 align-middle">
      <span className={cn("block h-full rounded-sm", tone === "bad" ? "bg-bad" : "bg-series-returned")} style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
      {tick !== undefined ? <span className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: `${tick * 100}%` }} /> : null}
    </span>
  );
}

function financeNote(evidence: string) {
  const at = evidence.indexOf("Flagged by Finance");
  return at >= 0 ? evidence.slice(at) : null;
}

function Evidence({ row, reason }: { row: ReportRow; reason: FlagReason }) {
  const evidence = row.flags.find((f) => f.reason === reason)?.evidence ?? "";
  const note = financeNote(evidence);
  if (reason === "unbalanced") {
    const total = budgetTotals(row.budget).total;
    const diff = Math.round((total - row.award) * 100) / 100;
    return (
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="num">
            {formatCurrency(total)} of {formatCurrency(row.award)} award
          </span>
          <Meter ratio={row.award === 0 ? 0 : total / row.award} tone={diff < 0 ? "bad" : "warn"} />
          <span className={cn("num font-semibold", diff < 0 ? "text-bad" : "text-warn")}>
            {diff < 0 ? "Under" : "Over"} by {formatCurrency(Math.abs(diff))}
          </span>
        </p>
        {note ? <p className="text-[13px] text-muted">{note}</p> : null}
      </div>
    );
  }
  if (reason === "incomplete" || reason === "validation") {
    const n = row.issues.length;
    return (
      <div>
        <details className="group">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="font-semibold text-bad">
              {n} required {plural(n, "answer", "answers")} {reason === "incomplete" ? "missing or failing" : "failing a rule"}
            </span>{" "}
            <span className="text-sm font-semibold text-link underline underline-offset-2">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-ink-2">
            {row.issues.map((issue, i) => (
              <li key={`${issue.message}-${i}`}>{issue.message}</li>
            ))}
          </ul>
        </details>
        {note ? <p className="mt-1 text-[13px] text-muted">{note}</p> : null}
      </div>
    );
  }
  if (reason === "low_outcomes" || reason === "zero_outcomes") {
    const answers = row.definition ? visibleAnswers(row.definition, row.answers) : row.answers;
    const actual = numberAnswer(answers, "participants_actual") ?? 0;
    const target = numberAnswer(answers, "participants_target");
    if (target && target > 0) {
      return (
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="num">
              {formatCount(actual)} of {formatCount(target)} served ({Math.round((actual / target) * 100)} percent)
            </span>
            <Meter ratio={actual / target} tick={0.4} tone="warn" />
          </p>
          <p className="text-[13px] text-muted">Target line at 40 percent.{note ? ` ${note}` : ""}</p>
        </div>
      );
    }
  }
  return <p className="text-[15px] leading-[22px]">{evidence}</p>;
}

export default async function FlaggedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(FINANCE_ROLES);
  const raw = await searchParams;
  const reasonParam = (Array.isArray(raw.reason) ? raw.reason[0] : raw.reason) ?? "";

  const data = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const filters = parseFilters(raw, periods);
    const period = periods.find((p) => p.id === filters.period);
    if (!period) return null;
    const rows = await loadReportRows(tx, period);
    const options = await loadFilterOptions(tx);
    const members = await loadCouncilMembers(tx);
    return { periods, filters, rows, options, members };
  });
  if (!data) return <NoPeriods title="Flagged items" />;
  const { periods, filters, rows, options, members } = data;

  const base = "/finance/flagged";
  const scoped = applyFilters(rows, { ...filters, flag: "" }, ["bucket", "status"]);
  const counts = Object.fromEntries(FLAG_ORDER.map((reason) => [reason, scoped.filter((r) => r.flags.some((f) => f.reason === reason)).length])) as Record<FlagReason, number>;
  const requested = (FLAG_ORDER as readonly string[]).includes(filters.flag) ? filters.flag : (FLAG_ORDER as readonly string[]).includes(reasonParam) ? reasonParam : "";
  const reason = (requested || FLAG_ORDER.find((r) => counts[r] > 0) || "unbalanced") as FlagReason;
  const items = sortRows(scoped.filter((r) => r.flags.some((f) => f.reason === reason)));
  const paged = paginate(items, filters.page, PAGE);
  const total = new Set(scoped.filter((r) => r.flags.length > 0).map((r) => r.assignmentId)).size;
  const keepFilters = { ...filters, flag: reason, bucket: "", status: "" };
  const clearHref = hrefWith(base, {}, { period: filters.period, flag: reason });

  const chips: Chip[] = [];
  if (filters.q) chips.push({ key: "q", label: `Search: ${filters.q}`, href: hrefWith(base, keepFilters, { q: "", page: 1 }) });
  if (filters.borough) chips.push({ key: "borough", label: filters.borough, href: hrefWith(base, keepFilters, { borough: "", page: 1 }) });
  if (filters.district) chips.push({ key: "district", label: `District ${filters.district}${filters.by === "sponsor" ? ", funded by its Council Member" : ""}`, href: hrefWith(base, keepFilters, { district: "", by: "", page: 1 }) });
  if (filters.member) chips.push({ key: "member", label: `Sponsor: ${members.get(Number(filters.member)) ?? filters.member}`, href: hrefWith(base, keepFilters, { member: "", page: 1 }) });
  if (filters.category) chips.push({ key: "category", label: filters.category, href: hrefWith(base, keepFilters, { category: "", page: 1 }) });
  if (filters.initiative) chips.push({ key: "initiative", label: `Initiative: ${filters.initiative}`, href: hrefWith(base, keepFilters, { initiative: "", page: 1 }) });

  return (
    <>
      <div className="mb-7">
        <Breadcrumbs crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Flagged items" }]} />
        <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">Flagged items</h1>
        <p className="mt-2 max-w-[70ch] text-lg leading-7 text-ink-2">
          <span className="num">{total}</span> {plural(total, "report is", "reports are")} flagged for {periods.find((p) => p.id === filters.period)?.label ?? "this period"}.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Flag reasons" className="rounded border border-line bg-white lg:sticky lg:top-6">
          <ul className="divide-y divide-line-soft">
            {FLAG_ORDER.map((r) => {
              const active = r === reason;
              return (
                <li key={r}>
                  <Link
                    href={hrefWith(base, keepFilters, { flag: r, page: 1 })}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-11 items-center justify-between gap-3 px-4 py-2.5 text-[15px]",
                      active ? "bg-harbor-50 font-bold text-harbor-900" : counts[r] === 0 ? "text-muted hover:bg-surface" : "text-ink hover:bg-harbor-50 hover:text-link hover:underline"
                    )}
                  >
                    {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-action" /> : null}
                    <span>{FLAG_LABEL[r]}</span>
                    <span className={cn("num", counts[r] === 0 ? "text-muted" : "font-semibold")}>{counts[r]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section aria-labelledby="reason-title" className="min-w-0 rounded border border-line bg-white">
          <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
            <h2 id="reason-title" className="text-xl font-bold leading-7 text-ink">
              {FLAG_LABEL[reason]} <span className="num font-semibold text-muted">({items.length})</span>
            </h2>
            <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">{EXPLAIN[reason]}</p>
          </div>
          <div className="px-5 pt-4 sm:px-6">
            <SubmissionFilters
              action={base}
              filters={filters}
              periods={periods}
              categories={options.categories}
              members={[...members.entries()].map(([district, name]) => ({ district, name }))}
              agencies={options.agencies}
              fields={["q", "period", "borough", "district", "initiative", "category"]}
              keep={{ flag: reason }}
              clearHref={clearHref}
              active={chips.length > 0}
            />
            <ActiveChips chips={chips} />
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Flag className="h-6 w-6 text-muted" aria-hidden="true" />
              <p className="text-[17px] font-bold text-ink">No {FLAG_LABEL[reason].toLowerCase()} in this period</p>
              <p className="max-w-md text-[15px] text-muted">{chips.length > 0 ? "Nothing matches these filters. Clear a filter or choose another reason." : "Choose another reason on the left, or another reporting period."}</p>
            </div>
          ) : (
            <>
              <Table density="compact" className="[&_td]:text-[15px]">
                <THead>
                  <tr>
                    <TH className="w-[28%]">Organization</TH>
                    <TH>Initiative</TH>
                    <TH align="right">Award</TH>
                    <TH className="w-[30%]">Evidence</TH>
                    <TH>
                      <span className="sr-only">Action</span>
                    </TH>
                  </tr>
                </THead>
                <tbody>
                  {paged.items.map((row) => (
                    <TR key={`${reason}-${row.assignmentId}`}>
                      <TD>
                        <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                          {row.orgName}
                        </Link>
                        <span className="num block whitespace-nowrap text-[13px] text-muted">{orgMeta(row)}</span>
                      </TD>
                      <TD className="min-w-40">
                        {row.initiativeName}
                        <span className="block whitespace-nowrap text-[13px] text-muted">
                          {row.initiativeCode}
                          {row.referenceNo ? <span className="font-mono"> · {row.referenceNo}</span> : null}
                        </span>
                      </TD>
                      <TD align="right">{formatCurrency(row.award, { cents: false })}</TD>
                      <TD className="min-w-64">
                        <Evidence row={row} reason={reason} />
                      </TD>
                      <TD className="whitespace-nowrap text-right">
                        {row.submissionId ? (
                          <Link href={`/finance/submissions/${row.submissionId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                            Open<span className="sr-only"> {row.referenceNo}</span>
                          </Link>
                        ) : (
                          <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                            View organization
                          </Link>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
              <Pagination page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={paged.total} hrefFor={(p) => hrefWith(base, keepFilters, { page: p }, { page: true })} />
            </>
          )}
        </section>
      </div>
    </>
  );
}
