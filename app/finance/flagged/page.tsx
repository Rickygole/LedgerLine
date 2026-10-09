import type { Metadata } from "next";
import Link from "next/link";
import { Flag } from "lucide-react";
import { FilterBar } from "@/components/finance/review/filter-bar";
import { FilterPills } from "@/components/finance/review/filter-pills";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { loadFilterOptions, loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { applyFilters, sortRows } from "@/lib/finance/review/derive";
import { FLAG_LABEL, FLAG_ORDER, hrefWith, parseFilters } from "@/lib/finance/review/filters";
import type { FlagReason } from "@/lib/finance/review/types";
import { formatCurrency } from "@/lib/rules/money";

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

const GROUP_LIMIT = 10;

const FLAG_NOUN: Record<FlagReason, string> = {
  unbalanced: "unbalanced budgets",
  incomplete: "incomplete reports",
  missing: "missing reports",
  validation: "reports failing validation",
  zero_outcomes: "reports with no participants",
  low_outcomes: "reports with low outcomes",
  manual: "flags added by Finance",
};

export default async function FlaggedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(FINANCE_ROLES);
  const raw = await searchParams;

  const { periods, filters, rows, options } = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const filters = parseFilters(raw, periods);
    const period = periods.find((p) => p.id === filters.period)!;
    const rows = await loadReportRows(tx, period);
    const options = await loadFilterOptions(tx);
    return { periods, filters, rows, options };
  });

  const base = "/finance/flagged";
  const scoped = applyFilters(rows, { ...filters, flag: "" }, ["bucket", "status"]);
  const flaggedRows = sortRows(scoped.filter((r) => r.flags.length > 0));
  const counts = Object.fromEntries(FLAG_ORDER.map((reason) => [reason, flaggedRows.filter((r) => r.flags.some((f) => f.reason === reason)).length])) as Record<FlagReason, number>;
  const visible = FLAG_ORDER.filter((reason) => (filters.flag === "" || filters.flag === "any" || filters.flag === reason) && counts[reason] > 0);
  const clearHref = hrefWith(base, {}, { period: filters.period });

  return (
    <>
      <PageHeader
        title="Flagged items"
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Flagged items" }]}
        description="Reports that need attention, grouped by reason. Each row shows the evidence."
        meta={<span className="num text-sm text-muted">{flaggedRows.length} {flaggedRows.length === 1 ? "report" : "reports"} flagged</span>}
      />

      <FilterBar action={base} filters={filters} periods={periods} categories={options.categories} members={options.members} agencies={options.agencies} fields={["q", "initiative", "category", "borough", "member", "period", "flag"]} clearHref={clearHref} />

      <FilterPills
        label="Flag reasons"
        pills={[
          { key: "all", label: "All reasons", count: flaggedRows.length, href: hrefWith(base, filters, { flag: "" }), active: filters.flag === "" || filters.flag === "any" },
          ...FLAG_ORDER.map((reason) => ({ key: reason, label: FLAG_LABEL[reason], count: counts[reason], href: hrefWith(base, filters, { flag: reason }), active: filters.flag === reason })),
        ]}
      />

      {visible.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <Flag className="h-6 w-6 text-muted" aria-hidden="true" />
            <p className="text-[15px] font-semibold text-ink">No flagged items</p>
            <p className="max-w-md text-sm text-muted">Nothing in this period matches these filters. Try another period or clear a filter.</p>
            <Link href={clearHref} className={buttonClass("secondary", "sm", "mt-2")}>
              Clear filters
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {visible.map((reason) => {
            const items = flaggedRows.filter((r) => r.flags.some((f) => f.reason === reason));
            const capped = filters.flag !== reason && items.length > GROUP_LIMIT;
            const shown = capped ? items.slice(0, GROUP_LIMIT) : items;
            return (
              <Card key={reason}>
                <CardHeader title={`${FLAG_LABEL[reason]} (${items.length})`} description={EXPLAIN[reason]} />
                <Table density="compact">
                  <THead>
                    <tr>
                      <TH>Organization</TH>
                      <TH>Initiative</TH>
                      <TH align="right">Award</TH>
                      <TH>Evidence</TH>
                      <TH>
                        <span className="sr-only">Action</span>
                      </TH>
                    </tr>
                  </THead>
                  <tbody>
                    {shown.map((row) => {
                      const evidence = row.flags.find((f) => f.reason === reason)!.evidence;
                      return (
                        <TR key={`${reason}-${row.assignmentId}`}>
                          <TD className="min-w-48">
                            <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                              {row.orgName}
                            </Link>
                            <span className="num block whitespace-nowrap font-mono text-xs text-muted">{row.ein}</span>
                          </TD>
                          <TD className="min-w-48">
                            <Link href={`/finance/initiatives/${row.initiativeId}`} className="hover:text-link hover:underline">
                              {row.initiativeName}
                            </Link>
                          </TD>
                          <TD align="right">{formatCurrency(row.award)}</TD>
                          <TD className="max-w-xl text-[13px] leading-5 text-ink">{evidence}</TD>
                          <TD className="whitespace-nowrap text-right">
                            {row.submissionId ? (
                              <Link href={`/finance/submissions/${row.submissionId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                                Open <span className="font-mono text-[13px]">{row.referenceNo}</span>
                              </Link>
                            ) : (
                              <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                                View organization
                              </Link>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
                {capped ? (
                  <div className="border-t border-line px-5 py-3 text-sm">
                    <span className="text-muted">
                      Showing {GROUP_LIMIT} of {items.length}.{" "}
                    </span>
                    <Link href={hrefWith(base, filters, { flag: reason })} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      Show all {items.length} {FLAG_NOUN[reason]}
                    </Link>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
