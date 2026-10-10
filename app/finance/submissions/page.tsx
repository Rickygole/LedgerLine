import type { Metadata } from "next";
import { ActiveChips, ExportMenu, UnderlineTabs, type Chip } from "@/components/finance/review/list-controls";
import { Pagination } from "@/components/finance/review/pagination";
import { SubmissionFilters } from "@/components/finance/review/submission-filters";
import { SubmissionsTable } from "@/components/finance/review/submissions-table";
import { Card } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/ui/page-header";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { contractLabel, fundingLabel } from "@/lib/finance/awards";
import { loadCouncilMembers } from "@/lib/finance/district-stats";
import { loadFilterOptions, loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { activeFilterCount, filtersToParams, FLAG_LABEL, hrefWith, parseFilters } from "@/lib/finance/review/filters";
import { applyFilters, countBuckets, paginate, sortByUrgency } from "@/lib/finance/review/derive";
import type { Filters } from "@/lib/finance/review/types";
import { BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { NoPeriods } from "@/components/finance/no-periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Submissions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TAB_ORDER: Bucket[] = ["missing", "submitted", "in_review", "returned", "accepted", "outstanding"];
const TAB_LABEL: Record<Bucket, string> = { ...BUCKET_LABEL, submitted: "Waiting for review" };

export default async function SubmissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(FINANCE_ROLES);
  const raw = await searchParams;

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
  if (!data) return <NoPeriods title="Submissions" />;
  const { periods, filters, rows, options, members } = data;

  const matched = sortByUrgency(applyFilters(rows, filters));
  const bucketCounts = countBuckets(applyFilters(rows, filters, ["bucket"]));
  const paged = paginate(matched, filters.page);
  const base = "/finance/submissions";
  const exportHref = (format: string) => {
    const params = filtersToParams(filters);
    params.set("format", format);
    return `/api/export?${params.toString()}`;
  };
  const clearHref = hrefWith(base, {}, { period: filters.period });
  const total = Object.values(bucketCounts).reduce((a, b) => a + b, 0);
  const allMembers = [...members.entries()].map(([district, name]) => ({ district, name }));

  const remove = (changes: Partial<Filters>) => hrefWith(base, filters, { ...changes, page: 1 });
  const chips: Chip[] = [];
  if (filters.q) chips.push({ key: "q", label: `Search: ${filters.q}`, href: remove({ q: "" }) });
  if (filters.district) {
    const how = filters.by === "sponsor" ? "funded by its Council Member" : "organization location";
    chips.push({ key: "district", label: `District ${filters.district}, ${how}`, href: remove({ district: "", by: "" }) });
  }
  if (filters.borough) chips.push({ key: "borough", label: filters.borough, href: remove({ borough: "" }) });
  if (filters.member) chips.push({ key: "member", label: `Sponsor: ${members.get(Number(filters.member)) ?? `District ${filters.member}`}`, href: remove({ member: "" }) });
  if (filters.bucket && filters.bucket in TAB_LABEL) chips.push({ key: "bucket", label: TAB_LABEL[filters.bucket as Bucket], href: remove({ bucket: "" }) });
  if (filters.initiative) chips.push({ key: "initiative", label: `Initiative: ${rows.find((r) => r.initiativeId === filters.initiative)?.initiativeName ?? filters.initiative}`, href: remove({ initiative: "" }) });
  if (filters.category) chips.push({ key: "category", label: filters.category, href: remove({ category: "" }) });
  if (filters.funding) chips.push({ key: "funding", label: fundingLabel(filters.funding), href: remove({ funding: "" }) });
  if (filters.contract) chips.push({ key: "contract", label: contractLabel(filters.contract), href: remove({ contract: "" }) });
  if (filters.agency) chips.push({ key: "agency", label: filters.agency, href: remove({ agency: "" }) });
  if (filters.flag) chips.push({ key: "flag", label: filters.flag === "any" ? "Any flag" : (FLAG_LABEL[filters.flag] ?? filters.flag), href: remove({ flag: "" }) });
  if (filters.status) chips.push({ key: "status", label: `Status: ${filters.status.replace(/_/g, " ")}`, href: remove({ status: "" }) });
  if (filters.orgType) chips.push({ key: "orgType", label: filters.orgType === "agency" ? "City agency" : "Community organization", href: remove({ orgType: "" }) });
  if (filters.awardMin) chips.push({ key: "awardMin", label: `Award at least $${filters.awardMin}`, href: remove({ awardMin: "" }) });
  if (filters.awardMax) chips.push({ key: "awardMax", label: `Award at most $${filters.awardMax}`, href: remove({ awardMax: "" }) });

  return (
    <>
      <div className="mb-7">
        <Breadcrumbs crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Submissions" }]} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1 basis-80">
            <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">Submissions</h1>
          </div>
          <ExportMenu
            items={[
              { label: "Excel workbook (.xlsx)", href: exportHref("xlsx") },
              { label: "CSV file (.csv)", href: exportHref("csv") },
            ]}
          />
        </div>
      </div>

      <SubmissionFilters
        action={base}
        filters={filters}
        periods={periods}
        categories={options.categories}
        members={allMembers}
        agencies={options.agencies}
        fields={["q", "period", "borough", "district", "member", "initiative", "category", "funding", "contract", "agency", "flag"]}
        keep={{ bucket: filters.bucket, status: filters.status, org_type: filters.orgType, award_min: filters.awardMin, award_max: filters.awardMax }}
        clearHref={clearHref}
        active={activeFilterCount(filters) > 0}
      />

      <ActiveChips chips={chips} />

      <UnderlineTabs
        label="Filter by bucket"
        tabs={[
          { key: "all", label: "All", count: total, href: hrefWith(base, filters, { bucket: "", page: 1 }), active: filters.bucket === "" },
          ...TAB_ORDER.filter((b) => b !== "outstanding" || bucketCounts.outstanding > 0 || filters.bucket === "outstanding").map((bucket) => ({
            key: bucket,
            label: TAB_LABEL[bucket],
            count: bucketCounts[bucket],
            href: hrefWith(base, filters, { bucket, page: 1 }),
            active: filters.bucket === bucket,
          })),
        ]}
      />

      <Card>
        <SubmissionsTable rows={paged.items} emptyHref={clearHref} />
        <Pagination page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={paged.total} hrefFor={(p) => hrefWith(base, filters, { page: p }, { page: true })} />
      </Card>
      <p className="mt-3 text-sm text-muted">
        <span className="num">{matched.length.toLocaleString("en-US")}</span> {matched.length === 1 ? "report" : "reports"}
      </p>
    </>
  );
}
