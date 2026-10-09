import type { Metadata } from "next";
import { Download, FileSpreadsheet } from "lucide-react";
import { FilterBar } from "@/components/finance/review/filter-bar";
import { FilterPills } from "@/components/finance/review/filter-pills";
import { Pagination } from "@/components/finance/review/pagination";
import { SubmissionsTable } from "@/components/finance/review/submissions-table";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { loadFilterOptions, loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { applyFilters, BUCKET_ORDER, countBuckets, isExportable, paginate, sortRows } from "@/lib/finance/review/derive";
import { filtersToParams, hrefWith, parseFilters } from "@/lib/finance/review/filters";
import { BUCKET_LABEL } from "@/lib/reporting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Submissions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
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

  const matched = sortRows(applyFilters(rows, filters));
  const bucketCounts = countBuckets(applyFilters(rows, filters, ["bucket"]));
  const paged = paginate(matched, filters.page);
  const base = "/finance/submissions";
  const exportParams = (format: string) => {
    const params = filtersToParams(filters);
    params.set("format", format);
    return `/api/export?${params.toString()}`;
  };
  const withSubmission = matched.filter((r) => isExportable(r.status)).length;

  return (
    <>
      <PageHeader
        title="Submissions"
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Submissions" }]}
        description="One row for every award and reporting period, including organizations that have not started."
        actions={
          <>
            <a href={exportParams("xlsx")} className={buttonClass("secondary", "md")} download>
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Excel
            </a>
            <a href={exportParams("csv")} className={buttonClass("secondary", "md")} download>
              <Download className="h-4 w-4" aria-hidden="true" />
              CSV
            </a>
          </>
        }
      />

      <FilterBar
        action={base}
        filters={filters}
        periods={periods}
        categories={options.categories}
        members={options.members}
        agencies={options.agencies}
        fields={["q", "initiative", "category", "borough", "member", "funding", "contract", "agency", "period", "status", "flag"]}
        clearHref={hrefWith(base, {}, { period: filters.period })}
      />

      <FilterPills
        label="Filter by bucket"
        pills={[
          { key: "all", label: "All", count: Object.values(bucketCounts).reduce((a, b) => a + b, 0), href: hrefWith(base, filters, { bucket: "", page: 1 }), active: filters.bucket === "" },
          ...BUCKET_ORDER.map((bucket) => ({ key: bucket, label: BUCKET_LABEL[bucket], count: bucketCounts[bucket], href: hrefWith(base, filters, { bucket, page: 1 }), active: filters.bucket === bucket })),
        ]}
      />

      <Card>
        <SubmissionsTable rows={paged.items} emptyHref={hrefWith(base, {}, { period: filters.period })} />
        <Pagination page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={paged.total} hrefFor={(p) => hrefWith(base, filters, { page: p }, { page: true })} />
      </Card>
      <p className="mt-3 text-xs text-muted">
        <span className="num">{matched.length}</span> {matched.length === 1 ? "row matches" : "rows match"}. Exports include the {withSubmission} {withSubmission === 1 ? "report" : "reports"} in these results that have been submitted. Drafts and reports returned to the organization are left out.
      </p>
    </>
  );
}
