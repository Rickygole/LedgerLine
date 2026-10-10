import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DistrictMapCard, DistrictRanking } from "@/components/finance/map/district-map";
import { AutoSelect } from "@/components/finance/map/auto-select";
import { NoPeriods } from "@/components/finance/no-periods";
import { Stat } from "@/components/ui/stat";
import { FiscalYearTimeline } from "@/components/ui/fiscal-year-timeline";
import { StatusStackChart, type StackDatum } from "@/components/charts/status-stack";
import { buttonClass } from "@/components/ui/button";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { todayInNewYork } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { districtStats, loadCouncilMembers, parseMapMode } from "@/lib/finance/district-stats";
import { loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { countBuckets, groupBy } from "@/lib/finance/review/derive";
import { hrefWith, parseFilters } from "@/lib/finance/review/filters";
import type { Filters, ReportRow } from "@/lib/finance/review/types";
import { isGeoBorough } from "@/lib/geo/boroughs";
import { cycleTimeline, dashboardHeadline, formatWholeDollars, periodEyebrow } from "@/lib/finance/dashboard";
import { formatShortDate } from "@/lib/report/format";
import { formatCount } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function FinanceDashboard({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(FINANCE_ROLES);
  const raw = await searchParams;
  const mode = parseMapMode(raw.map);
  const borough = isGeoBorough(first(raw.borough)) ? first(raw.borough) : "";
  const table = first(raw.table) === "1";
  const sort = first(raw.sort) === "missing" ? "missing" : "district";

  const data = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const filters = parseFilters(raw, periods);
    const period = periods.find((p) => p.id === filters.period);
    if (!period) return null;
    const rows = await loadReportRows(tx, period);
    const members = await loadCouncilMembers(tx);
    return { periods, period, rows, members };
  });
  if (!data) return <NoPeriods title="Dashboard" />;
  const { periods, period, rows, members } = data;

  const counts = countBuckets(rows);
  const stats = districtStats(rows, mode, members, borough);
  const canRemind = user.role === "finance_admin";
  const base = { period: period.id };
  const list = (extra: Partial<Filters>) => hrefWith("/finance/submissions", base, extra);
  const headline = dashboardHeadline(period, counts, rows.length);
  const timeline = cycleTimeline(period.fiscalYearId, periods);

  const waiting = rows.filter((r) => r.status === "submitted" && r.submissionId).sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const next = waiting[0];
  const acceptedPct = rows.length === 0 ? 0 : Math.round((counts.accepted / rows.length) * 100);
  const remindersHref = `/finance/reminders?period=${encodeURIComponent(period.id)}`;

  const largest = rows
    .filter((row) => row.bucket === "missing")
    .sort((a, b) => b.award - a.award || a.orgName.localeCompare(b.orgName))
    .slice(0, 6);

  const stack = (key: (row: ReportRow) => string): StackDatum[] => [...groupBy(rows, key).entries()].map(([name, group]) => ({ name, href: list({ category: name }), ...countBuckets(group) }));

  return (
    <>
      <div className="mb-7 grid grid-cols-1 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <p className="self-center text-sm font-semibold leading-5 text-muted sm:col-start-1 sm:row-start-1">{periodEyebrow(period)}</p>
        <AutoSelect
          id="period"
          name="period"
          label="Reporting period"
          value={period.id}
          keep={{ map: mode === "sponsor" ? "" : mode, borough }}
          options={periods.map((p) => ({ value: p.id, label: p.label }))}
          className="order-last mt-4 flex items-center gap-2 sm:order-none sm:col-start-2 sm:row-start-1 sm:mt-0 sm:justify-self-end"
        />
        <div className="min-w-0 sm:col-span-2 sm:row-start-2 lg:col-span-1">
          <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">{headline.title}</h1>
          <p className="mt-2 max-w-[70ch] text-lg leading-7 text-ink-2">{headline.lede}</p>
        </div>
        <div className="mt-4 flex flex-col-reverse gap-3 sm:col-span-2 sm:row-start-3 sm:flex-row sm:flex-wrap sm:items-center lg:col-span-1 lg:col-start-2 lg:row-start-2 lg:mt-0 lg:self-end">
          {canRemind ? (
            <Link href={remindersHref} className={buttonClass("secondary", "md", "h-11 w-full px-5 text-base sm:w-auto")}>
              Send reminders
            </Link>
          ) : null}
          {next ? (
            <Link href={`/finance/submissions/${next.submissionId}?queue=waiting`} className={buttonClass("primary", "md", "h-11 w-full px-5 text-base sm:w-auto")}>
              Review next submission
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>

      <section aria-label="Key figures" className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line-soft xl:grid-cols-4">
        <Stat className="rounded-none border-0" label="Missing" value={counts.missing} tone={counts.missing > 0 ? "bad" : "neutral"} sub="Past due, nothing submitted" action={{ href: list({ bucket: "missing" }), label: "Chase missing reports" }} />
        <Stat
          className="rounded-none border-0"
          label="Waiting for review"
          value={counts.submitted}
          sub={next?.submittedAt ? `Oldest ${formatShortDate(next.submittedAt)} · ${counts.in_review} already in review` : `${counts.in_review} already in review`}
          action={{ href: list({ bucket: "submitted" }), label: "Open review queue" }}
        />
        <Stat className="rounded-none border-0" label="Update requested" value={counts.returned} sub="Waiting on the organization" action={{ href: list({ bucket: "returned" }), label: "See requests" }} />
        <Stat
          className="rounded-none border-0"
          label="Accepted"
          value={
            <>
              {formatCount(counts.accepted)} <span className="text-lg font-semibold tracking-normal text-ink-2">of {formatCount(rows.length)}</span>
            </>
          }
          meter={{ value: counts.accepted, max: rows.length, label: `${acceptedPct} percent accepted` }}
          sub={`${acceptedPct} percent of reports due`}
        />
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-12 lg:items-start">
        <DistrictMapCard stats={stats} borough={borough} periodId={period.id} table={table} sort={sort} />
        <DistrictRanking stats={stats} borough={borough} periodId={period.id} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-12 lg:items-start">
        <StatusStackChart title="Status by initiative category" dimension="Category" data={stack((row) => row.category)} periodLabel={period.label} className="lg:col-span-8" />
        <section aria-labelledby="largest-title" className="min-w-0 rounded border border-line bg-white lg:col-span-4">
          <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
            <h2 id="largest-title" className="text-xl font-bold leading-7 text-ink">
              Largest missing awards
            </h2>
          </div>
          {largest.length === 0 ? (
            <p className="px-5 py-8 text-[15px] text-muted sm:px-6">Nothing is missing for {period.label}.</p>
          ) : (
            <ol className="divide-y divide-line-soft">
              {largest.map((row) => (
                <li key={row.assignmentId} className="flex items-baseline justify-between gap-4 px-5 py-3 sm:px-6">
                  <div className="min-w-0">
                    <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      {row.orgName}
                    </Link>
                    <p className="text-[13px] leading-5 text-muted">
                      {row.initiativeName}
                      {row.councilDistrict ? ` · District ${row.councilDistrict}` : ""}
                    </p>
                  </div>
                  <span className="num shrink-0 text-right text-[15px] font-semibold text-ink">{formatWholeDollars(row.award)}</span>
                </li>
              ))}
            </ol>
          )}
          {counts.missing > 0 && canRemind ? (
            <div className="border-t border-line-soft px-5 py-3 text-sm sm:px-6">
              <Link href={remindersHref} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                Send reminders to all {counts.missing}
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="calendar-title" className="rounded border border-line bg-white">
        <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
          <h2 id="calendar-title" className="text-xl font-bold leading-7 text-ink">
            {period.fiscalYearId} reporting calendar
          </h2>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <FiscalYearTimeline
            fiscalYear={period.fiscalYearId}
            startsOn={timeline.startsOn}
            endsOn={timeline.endsOn}
            today={todayInNewYork()}
            marks={timeline.marks}
            variant="compact"
            label={`${period.fiscalYearId} reporting calendar`}
          />
        </div>
      </section>
    </>
  );
}
