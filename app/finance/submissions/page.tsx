import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { FilterBar } from "@/components/finance/review/filter-bar";
import { Pagination } from "@/components/finance/review/pagination";
import { SubmissionsTable } from "@/components/finance/review/submissions-table";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { loadFilterOptions, loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { applyFilters, BUCKET_ORDER, countBuckets, paginate, sortRows } from "@/lib/finance/review/derive";
import { filtersToParams, hrefWith, parseFilters } from "@/lib/finance/review/filters";
import { BUCKET_LABEL } from "@/lib/reporting";
import { cn } from "@/lib/cn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Submissions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
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

  const matched = sortRows(applyFilters(rows, filters));
  const bucketCounts = countBuckets(applyFilters(rows, filters, ["bucket"]));
  const paged = paginate(matched, filters.page);
  const base = "/finance/submissions";
  const exportParams = (format: string) => {
    const params = filtersToParams(filters);
    params.set("format", format);
    return `/api/export?${params.toString()}`;
  };
  const withSubmission = matched.filter((r) => r.submissionId).length;

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
        categories={categories}
        fields={["q", "initiative", "category", "borough", "period", "bucket", "status", "flag"]}
        clearHref={hrefWith(base, {}, { period: filters.period })}
      />

      <nav aria-label="Filter by bucket" className="mb-3 flex flex-wrap gap-2">
        <Link
          href={hrefWith(base, filters, { bucket: "", page: 1 })}
          aria-current={filters.bucket === "" ? "true" : undefined}
          className={cn("rounded-full border px-3 py-1 text-sm font-medium", filters.bucket === "" ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-ink hover:bg-navy-50")}
        >
          All <span className="num">{Object.values(bucketCounts).reduce((a, b) => a + b, 0)}</span>
        </Link>
        {BUCKET_ORDER.map((bucket) => (
          <Link
            key={bucket}
            href={hrefWith(base, filters, { bucket, page: 1 })}
            aria-current={filters.bucket === bucket ? "true" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm font-medium", filters.bucket === bucket ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-ink hover:bg-navy-50")}
          >
            {BUCKET_LABEL[bucket]} <span className="num">{bucketCounts[bucket]}</span>
          </Link>
        ))}
      </nav>

      <Card>
        <SubmissionsTable rows={paged.items} emptyHref={hrefWith(base, {}, { period: filters.period })} />
        <Pagination page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={paged.total} hrefFor={(p) => hrefWith(base, filters, { page: p }, { page: true })} />
      </Card>
      <p className="mt-3 text-xs text-muted">
        Exports include the {withSubmission} {withSubmission === 1 ? "report" : "reports"} in these results that have been started. Synthetic demo data.
      </p>
    </>
  );
}
