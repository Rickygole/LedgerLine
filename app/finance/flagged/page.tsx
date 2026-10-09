import type { Metadata } from "next";
import Link from "next/link";
import { Flag } from "lucide-react";
import { FilterBar } from "@/components/finance/review/filter-bar";
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
import { cn } from "@/lib/cn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Flagged items" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const EXPLAIN: Record<FlagReason, string> = {
  unbalanced: "Draft or returned reports whose budget total does not equal the award.",
  incomplete: "Past-due drafts or returned reports that still fail required rules.",
  missing: "Past the due date with no report submitted.",
  validation: "Submitted reports that fail one or more validation rules.",
  zero_outcomes: "Submitted reports that served no participants.",
  low_outcomes: "Submitted reports that served fewer than 40 percent of the target.",
  manual: "Flags added by Finance staff that are still open.",
};

export default async function FlaggedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(FINANCE_ROLES);
  const raw = await searchParams;

  const { periods, filters, rows, categories } = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const filters = parseFilters(raw, periods.map((p) => p.id));
    const period = periods.find((p) => p.id === filters.period)!;
    const rows = await loadReportRows(tx, period);
    const options = await loadFilterOptions(tx);
    return { periods, filters, rows, categories: options.categories };
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

      <FilterBar action={base} filters={filters} periods={periods} categories={categories} fields={["q", "initiative", "category", "borough", "period", "flag"]} clearHref={clearHref} />

      <nav aria-label="Flag reasons" className="mb-5 flex flex-wrap gap-2">
        <Link href={hrefWith(base, filters, { flag: "" })} className={cn("rounded-full border px-3 py-1 text-sm font-medium", filters.flag === "" ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white hover:bg-navy-50")}>
          All reasons
        </Link>
        {FLAG_ORDER.map((reason) => (
          <Link
            key={reason}
            href={hrefWith(base, filters, { flag: reason })}
            aria-current={filters.flag === reason ? "true" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm font-medium", filters.flag === reason ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white hover:bg-navy-50")}
          >
            {FLAG_LABEL[reason]} <span className="num">{counts[reason]}</span>
          </Link>
        ))}
      </nav>

      {visible.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <Flag className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="text-base font-semibold text-ink">No flagged items match these filters</p>
            <p className="max-w-md text-sm text-muted">Try a different reporting period or remove a filter to see more reports.</p>
            <Link href={clearHref} className={buttonClass("secondary", "md")}>
              Clear filters
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {visible.map((reason) => {
            const items = flaggedRows.filter((r) => r.flags.some((f) => f.reason === reason));
            return (
              <Card key={reason}>
                <CardHeader title={`${FLAG_LABEL[reason]} (${items.length})`} description={EXPLAIN[reason]} />
                <Table>
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
                    {items.map((row) => {
                      const evidence = row.flags.find((f) => f.reason === reason)!.evidence;
                      return (
                        <TR key={`${reason}-${row.assignmentId}`}>
                          <TD className="min-w-48">
                            <Link href={`/finance/organizations/${row.orgId}`} className="font-medium text-ink hover:text-navy-700 hover:underline">
                              {row.orgName}
                            </Link>
                            <span className="num block text-xs text-muted">{row.ein}</span>
                          </TD>
                          <TD className="min-w-48">
                            <Link href={`/finance/initiatives/${row.initiativeId}`} className="hover:text-navy-700 hover:underline">
                              {row.initiativeName}
                            </Link>
                          </TD>
                          <TD align="right">{formatCurrency(row.award)}</TD>
                          <TD className="max-w-xl">{evidence}</TD>
                          <TD className="whitespace-nowrap text-right">
                            {row.submissionId ? (
                              <Link href={`/finance/submissions/${row.submissionId}`} className="font-semibold text-navy-700 hover:underline">
                                Open {row.referenceNo}
                              </Link>
                            ) : (
                              <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-navy-700 hover:underline">
                                View organization
                              </Link>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
