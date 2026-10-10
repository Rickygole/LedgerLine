import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DistrictMapCard, DistrictRanking } from "@/components/finance/map/district-map";
import { AutoSelect } from "@/components/finance/map/auto-select";
import { Stat } from "@/components/ui/stat";
import { FiscalYearTimeline, marksFromCalendar } from "@/components/ui/fiscal-year-timeline";
import { loadFiscalCalendar } from "@/lib/calendar";
import { StatusStackChart, type StackDatum } from "@/components/charts/status-stack";
import { buttonClass } from "@/components/ui/button";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { districtStats, loadCouncilMembers, parseMapMode } from "@/lib/finance/district-stats";
import { loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { countBuckets, groupBy } from "@/lib/finance/review/derive";
import { hrefWith, parseFilters } from "@/lib/finance/review/filters";
import type { Filters, ReportRow } from "@/lib/finance/review/types";
import { isGeoBorough } from "@/lib/geo/boroughs";
import { dashboardHeadline, periodEyebrow, plural } from "@/lib/finance/dashboard";

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

  const { periods, period, rows, members } = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const filters = parseFilters(raw, periods);
    const period = periods.find((p) => p.id === filters.period)!;
    const rows = await loadReportRows(tx, period);
    const members = await loadCouncilMembers(tx);
    return { periods, period, rows, members };
  });

  const calendar = await loadFiscalCalendar();
  const counts = countBuckets(rows);
  const stats = districtStats(rows, mode, members);
  const base = { period: period.id };
  const list = (extra: Partial<Filters>) => hrefWith("/finance/submissions", base, extra);
  const headline = dashboardHeadline(period, counts, rows.length);

  const waiting = rows.filter((r) => r.status === "submitted" && r.submissionId).sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const next = waiting[0];
  const acceptedPct = rows.length === 0 ? 0 : Math.round((counts.accepted / rows.length) * 100);

  const overdue = rows
    .filter((row) => row.bucket === "missing")
    .sort((a, b) => b.daysPastDue - a.daysPastDue || b.award - a.award || a.orgName.localeCompare(b.orgName))
    .slice(0, 6);

  const stack = (key: (row: ReportRow) => string): StackDatum[] => [...groupBy(rows, key).entries()].map(([name, group]) => ({ name, href: list({ category: name }), ...countBuckets(group) }));

  return (
    <>
      <div className="mb-7">
        <div className="mb-4 flex justify-end">
          <AutoSelect
            id="period"
            name="period"
            label="Reporting period"
            value={period.id}
            keep={{ map: mode === "sponsor" ? "" : mode, borough }}
            options={periods.map((p) => ({ value: p.id, label: p.label }))}
          />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 flex-1 basis-[28rem]">
            <p className="text-sm font-semibold leading-5 text-muted">{periodEyebrow(period)}</p>
            <h1 className="mt-1 text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">{headline.title}</h1>
            <p className="mt-2 max-w-[70ch] text-lg leading-7 text-ink-2">{headline.lede}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/finance/reminders?period=${encodeURIComponent(period.id)}`} className={buttonClass("secondary", "md", "h-11 px-5 text-base")}>
              Send reminders
            </Link>
            {next ? (
              <Link href={`/finance/submissions/${next.submissionId}?queue=waiting`} className={buttonClass("primary", "md", "h-11 px-5 text-base")}>
                Review next submission
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <section aria-label="Key figures" className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Missing" value={counts.missing} tone={counts.missing > 0 ? "bad" : "neutral"} sub="Past due, nothing submitted" action={{ href: list({ bucket: "missing" }), label: "Chase missing reports" }} />
        <Stat
          label="Waiting for review"
          value={counts.submitted}
          sub={next?.submittedAt ? `Oldest submitted ${formatDate(next.submittedAt)} · ${counts.in_review} in review` : `${counts.in_review} in review`}
          action={{ href: list({ bucket: "submitted" }), label: "Open review queue" }}
        />
        <Stat label="Update requested" value={counts.returned} sub="Waiting on the organization" action={{ href: list({ bucket: "returned" }), label: "See requests" }} />
        <Stat
          label="Accepted"
          value={
            <>
              {counts.accepted.toLocaleString("en-US")} <span className="text-lg font-semibold tracking-normal text-ink-2">of {rows.length.toLocaleString("en-US")}</span>
            </>
          }
          meter={{ value: counts.accepted, max: rows.length, label: `${acceptedPct} percent accepted` }}
          sub={`${acceptedPct} percent of reports due`}
        />
      </section>

      <div className="mb-4 grid gap-4 lg:grid-cols-12">
        <DistrictMapCard stats={stats} borough={borough} periodId={period.id} table={table} sort={sort} />
        <DistrictRanking stats={stats} borough={borough} periodId={period.id} />
      </div>

      <section aria-labelledby="calendar-title" className="mb-4 rounded border border-line bg-white">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
          <h2 id="calendar-title" className="text-xl font-bold leading-7 text-ink">
            {calendar.fiscalYear.id} at a glance
          </h2>
          <p className="text-[15px] text-ink-2">New York City fiscal years run July 1 to June 30.</p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <FiscalYearTimeline
            fiscalYear={calendar.fiscalYear.id}
            startsOn={calendar.fiscalYear.startsOn}
            endsOn={calendar.fiscalYear.endsOn}
            today={calendar.today}
            marks={marksFromCalendar(calendar)}
            variant="compact"
            label={`${calendar.fiscalYear.id} reporting calendar`}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <StatusStackChart
          title="Status by initiative category"
          description={`Where each ${period.label} report stands, by initiative category.`}
          dimension="Category"
          data={stack((row) => row.category)}
          periodLabel={period.label}
          className="lg:col-span-7"
        />
        <section aria-labelledby="overdue-title" className="min-w-0 rounded border border-line bg-white lg:col-span-5">
          <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
            <h2 id="overdue-title" className="text-xl font-bold leading-7 text-ink">
              Longest overdue
            </h2>
            <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">Missing reports, oldest first.</p>
          </div>
          {overdue.length === 0 ? (
            <p className="px-6 py-8 text-[15px] text-muted">Nothing is overdue for {period.label}.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {overdue.map((row) => (
                <li key={row.assignmentId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-5 py-3 sm:px-6">
                  <div className="min-w-0 flex-1 basis-56">
                    <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      {row.orgName}
                    </Link>
                    <p className="text-[13px] leading-5 text-muted">{row.initiativeName}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    <span className="num inline-flex rounded-sm bg-bad-bg px-2 py-0.5 text-[13px] font-semibold text-bad ring-1 ring-inset ring-bad/20">{plural(row.daysPastDue, "day", "days")} past due</span>
                    <Link href={`/finance/reminders?period=${encodeURIComponent(period.id)}`} className="text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      Send reminder<span className="sr-only"> to {row.orgName}</span>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line-soft px-5 py-3 text-sm sm:px-6">
            <Link href={list({ bucket: "missing" })} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
              See all {counts.missing} missing reports
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
