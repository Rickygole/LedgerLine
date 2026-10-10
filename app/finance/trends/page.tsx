import type { Metadata } from "next";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { one, pickOne, type SearchParams } from "@/lib/finance/admin/params";
import { loadPeriods } from "@/lib/finance/review/data";
import { defaultPeriodId } from "@/lib/finance/review/filters";
import { monthlySubmissions, submissionShareByGroup } from "@/lib/finance/trends";
import { ComparisonChart, MonthlyTrendChart } from "@/components/charts/trend-charts";
import { FilterBar, FilterField } from "@/components/finance/admin/filter-bar";
import { formatDate } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/field";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trends and comparisons" };

export default async function TrendsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  const data = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const categories = (
      await tx.query<{ category: string }>("SELECT DISTINCT category FROM initiative ORDER BY category")
    ).map((r) => r.category);
    const boroughs = (
      await tx.query<{ borough: string }>("SELECT DISTINCT borough FROM organization ORDER BY borough")
    ).map((r) => r.borough);
    const category = categories.includes(one(params, "category")) ? one(params, "category") : "";
    const borough = boroughs.includes(one(params, "borough")) ? one(params, "borough") : "";
    const period =
      periods.find((p) => p.id === one(params, "period")) ??
      periods.find((p) => p.id === defaultPeriodId(periods)) ??
      periods[0];
    const compare = pickOne(one(params, "compare"), ["category", "borough"] as const, "category");
    const filters = { category, borough, period: period.id, compare };
    return {
      periods,
      categories,
      boroughs,
      period,
      filters,
      months: await monthlySubmissions(tx, filters),
      groups: await submissionShareByGroup(tx, filters),
    };
  });
  const { filters, period } = data;
  const scope = [filters.category || "all categories", filters.borough || "all boroughs"].join(", ");
  const source = `Source: LedgerLine reporting data, ${scope}`;

  return (
    <>
      <PageHeader
        title="Trends and comparisons"
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Trends and comparisons" }]}
      />
      <div className="mb-6 overflow-hidden rounded border border-line bg-white">
        <FilterBar action="/finance/trends" clearHref="/finance/trends">
          <FilterField label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue={filters.category}>
              <option value="">All categories</option>
              {data.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Borough" htmlFor="borough">
            <Select id="borough" name="borough" defaultValue={filters.borough}>
              <option value="">All boroughs</option>
              {data.boroughs.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Compare by" htmlFor="compare">
            <Select id="compare" name="compare" defaultValue={filters.compare}>
              <option value="category">Category</option>
              <option value="borough">Borough</option>
            </Select>
          </FilterField>
          <FilterField label="Reporting period" htmlFor="period">
            <Select id="period" name="period" defaultValue={period.id}>
              {data.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MonthlyTrendChart
          data={data.months}
          periodLabel={period.label}
          description={`Reports submitted in each month, split by whether they met the ${formatDate(period.dueOn)} due date.`}
          source={source}
        />
        <ComparisonChart
          data={data.groups}
          dimension={filters.compare === "borough" ? "Borough" : "Category"}
          periodLabel={period.label}
          source={source}
        />
      </div>
    </>
  );
}
