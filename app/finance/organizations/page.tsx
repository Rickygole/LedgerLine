import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, FINANCE_ROLES } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { todayInNewYork } from "@/lib/dates";
import { formatCurrency } from "@/lib/rules/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TR, TD, EmptyRow } from "@/components/ui/table";
import { FilterBar, FilterField } from "@/components/finance/admin/filter-bar";
import { Pagination } from "@/components/finance/admin/pagination";
import { ProgressBar } from "@/components/finance/admin/progress-bar";
import { SortHeader } from "@/components/finance/admin/sort-header";
import { ORG_SORTS, listOrganizations, type OrgSort } from "@/lib/finance/admin/organizations";
import { loadPeriods } from "@/lib/finance/review/data";
import { defaultPeriodId } from "@/lib/finance/review/filters";
import { NoPeriods } from "@/components/finance/no-periods";
import { BOROUGHS, ORG_TYPES, orgTypeLabel } from "@/lib/finance/admin/sql";
import { one, pageNumber, pickOne, PAGE_SIZE, type SearchParams } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organizations" };

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  const q = one(params, "q");
  const borough = pickOne(one(params, "borough"), BOROUGHS, "" as never);
  const type = pickOne(one(params, "type"), ["cbo", "agency"] as const, "" as never);
  const missing = one(params, "missing") === "1";
  const sort = pickOne(one(params, "sort"), Object.keys(ORG_SORTS) as OrgSort[], "name");
  const dir = one(params, "dir") === "desc" ? "desc" : "asc";
  const page = pageNumber(params);

  const data = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const period = periods.find((p) => p.id === one(params, "period")) ?? periods.find((p) => p.id === defaultPeriodId(periods));
    if (!period) return null;
    const list = await listOrganizations(tx, todayInNewYork(), period.id, { q, borough, type, missing, sort, dir, page });
    return { ...list, periods, period };
  });
  if (!data) return <NoPeriods title="Organizations" />;
  const { rows, total, periods, period } = data;

  const base = "/finance/organizations";
  const kept = { q, borough, type, missing: missing ? "1" : undefined, sort, dir, period: period.id };

  return (
    <>
      <PageHeader title="Organizations" description={`Every organization funded through Council initiatives. Awards and compliance count the ${period.label} reports that fall due for ${period.fiscalYearId} awards.`} crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Organizations" }]} />
      <Card>
        <FilterBar action={base} clearHref={`${base}?period=${period.id}`} applied={[borough, type, missing ? "1" : ""].filter(Boolean).length}>
          <FilterField label="Search" htmlFor="q" className="min-w-64 flex-1">
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Name or 12-3456789" />
          </FilterField>
          <FilterField label="Reporting period" htmlFor="period">
            <Select id="period" name="period" defaultValue={period.id}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Borough" htmlFor="borough">
            <Select id="borough" name="borough" defaultValue={borough}>
              <option value="">All boroughs</option>
              {BOROUGHS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Type" htmlFor="type">
            <Select id="type" name="type" defaultValue={type}>
              <option value="">All types</option>
              {ORG_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Reports" htmlFor="missing">
            <Select id="missing" name="missing" defaultValue={missing ? "1" : ""}>
              <option value="">All organizations</option>
              <option value="1">Has missing reports</option>
            </Select>
          </FilterField>
        </FilterBar>
        <Table density="compact" stack>
          <THead>
            <tr>
              <SortHeader base={base} params={kept} field="name" label="Organization" sort={sort} dir={dir} />
              <SortHeader base={base} params={kept} field="ein" label="EIN" sort={sort} dir={dir} />
              <SortHeader base={base} params={kept} field="type" label="Type" sort={sort} dir={dir} />
              <SortHeader base={base} params={kept} field="borough" label="Borough" sort={sort} dir={dir} />
              <SortHeader base={base} params={kept} field="district" label="District" sort={sort} dir={dir} align="right" />
              <SortHeader base={base} params={kept} field="awards" label="Awards" sort={sort} dir={dir} align="right" />
              <SortHeader base={base} params={kept} field="total" label="Awarded" sort={sort} dir={dir} align="right" />
              <SortHeader base={base} params={kept} field="compliance" label={period.label} sort={sort} dir={dir} />
              <SortHeader base={base} params={kept} field="missing" label="Missing" sort={sort} dir={dir} align="right" />
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={9}>No organizations match these filters. Clear the filters to see every organization.</EmptyRow>
            ) : (
              rows.map((row) => (
                <TR key={row.id}>
                  <TD className="min-w-[16rem]" primary>
                    <Link href={`${base}/${row.id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      {row.legal_name}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap font-mono text-[13px] text-muted" label="EIN">
                    <span>{row.ein}</span>
                  </TD>
                  <TD className="whitespace-nowrap" stackHidden>{orgTypeLabel(row.org_type)}</TD>
                  <TD className="whitespace-nowrap" label="Borough">
                    <span>{row.borough}</span>
                  </TD>
                  <TD align="right" stackHidden>{row.council_district ?? ""}</TD>
                  <TD align="right" label="Awards">
                    <span>{row.awards}</span>
                  </TD>
                  <TD align="right" label="Awarded">
                    <span>{formatCurrency(Number(row.total), { cents: false })}</span>
                  </TD>
                  <TD label={period.label}>{row.awards > 0 ? <ProgressBar value={row.accepted} max={row.awards} label={`${row.legal_name} accepted reports`} /> : <span className="text-muted">No awards</span>}</TD>
                  <TD align="right" label="Missing">{row.missing > 0 ? <Badge tone="bad">{row.missing} missing</Badge> : <span className="text-muted">None</span>}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        <Pagination base={base} params={kept} page={page} pageSize={PAGE_SIZE} total={total} />
      </Card>
    </>
  );
}
