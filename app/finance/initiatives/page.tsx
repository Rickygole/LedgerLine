import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { todayInNewYork } from "@/lib/dates";
import { formatCompactCurrency, formatCurrency } from "@/lib/rules/money";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { FilterBar, FilterField } from "@/components/finance/admin/filter-bar";
import { Pagination } from "@/components/finance/admin/pagination";
import { ProgressBar } from "@/components/finance/admin/progress-bar";
import { categorySummary, listAgencies, listCategories, listInitiatives } from "@/lib/finance/admin/initiatives";
import { loadPeriods } from "@/lib/finance/review/data";
import { defaultPeriodId } from "@/lib/finance/review/filters";
import { buildHref, one, pageNumber, PAGE_SIZE, type SearchParams } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Initiatives" };

export default async function InitiativesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  const q = one(params, "q");
  const status = ["active", "retired"].includes(one(params, "status")) ? one(params, "status") : "";
  const page = pageNumber(params);
  const today = todayInNewYork();

  const data = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const period = periods.find((p) => p.id === one(params, "period")) ?? periods.find((p) => p.id === defaultPeriodId(periods))!;
    const categories = await listCategories(tx);
    const agencies = await listAgencies(tx);
    const category = categories.includes(one(params, "category")) ? one(params, "category") : "";
    const agency = agencies.includes(one(params, "agency")) ? one(params, "agency") : "";
    const list = await listInitiatives(tx, today, period.id, { q, category, status, agency, page });
    const summary = await categorySummary(tx, today, period.id);
    return { periods, period, categories, agencies, category, agency, summary, ...list };
  });

  const base = "/finance/initiatives";
  const totals = data.summary.reduce(
    (t, c) => ({ funding: t.funding + Number(c.funding), initiatives: t.initiatives + c.initiatives, accepted: t.accepted + c.accepted, assignments: t.assignments + c.assignments, missing: t.missing + c.missing }),
    { funding: 0, initiatives: 0, accepted: 0, assignments: 0, missing: 0 }
  );
  const maxFunding = Math.max(0, ...data.summary.map((c) => Number(c.funding)));
  const kept = { q, category: data.category, status, agency: data.agency, period: data.period.id };

  return (
    <>
      <PageHeader
        title="Initiatives"
        description={`Council initiatives funded in ${data.period.fiscalYearId} and how ${data.period.label} reporting is going.`}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Initiatives" }]}
        actions={
          user.role === "finance_admin" ? (
            <ButtonLink href="/finance/initiatives/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New initiative
            </ButtonLink>
          ) : null
        }
      />

      <Card className="mb-6">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-xl border-b border-line bg-line lg:grid-cols-4">
          {[
            { label: "Total funding", value: formatCurrency(totals.funding), hint: `${data.summary.length} categories` },
            { label: "Initiatives", value: totals.initiatives, hint: `${totals.assignments} organization awards` },
            { label: `${data.period.id} accepted`, value: `${totals.accepted} of ${totals.assignments}`, hint: `${data.period.label} reports accepted` },
            { label: "Missing reports", value: totals.missing, hint: `${data.period.label}, nothing submitted and past due`, bad: totals.missing > 0 },
          ].map((tile) => (
            <div key={tile.label} className="min-w-0 bg-white px-4 py-4 sm:px-5">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                {tile.bad ? <AlertTriangle className="h-3.5 w-3.5 text-bad" aria-hidden="true" /> : null}
                {tile.label}
              </dt>
              <dd className="num mt-1.5 text-xl font-bold tracking-tight text-ink sm:text-2xl">{tile.value}</dd>
              <dd className="mt-0.5 text-xs text-muted">{tile.hint}</dd>
            </div>
          ))}
        </dl>
        <div className="px-4 py-4 sm:px-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">
              Funding by category <span className="font-normal text-muted">(total and number of initiatives)</span>
            </h2>
            {data.category ? (
              <Link href={buildHref(base, { q, status, agency: data.agency, period: data.period.id })} className="text-sm font-semibold text-navy-700 hover:underline">
                Show all categories
              </Link>
            ) : (
              <span className="text-xs text-muted">Choose a category to filter the list below</span>
            )}
          </div>
          <ul className="grid gap-x-8 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
            {data.summary.map((c) => {
              const selected = data.category === c.category;
              const share = maxFunding > 0 ? Math.max(2, Math.round((Number(c.funding) / maxFunding) * 100)) : 0;
              return (
                <li key={c.category}>
                  <Link
                    href={buildHref(base, { q, status, agency: data.agency, period: data.period.id, category: selected ? undefined : c.category })}
                    aria-current={selected ? "true" : undefined}
                    className={cn("group block rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-navy-50", selected && "bg-navy-50 ring-1 ring-navy-600/30")}
                  >
                    <span className="flex items-baseline justify-between gap-3 text-sm">
                      <span className={cn("truncate", selected ? "font-semibold text-navy-900" : "text-ink")}>{c.category}</span>
                      <span className="num shrink-0 text-muted">
                        {formatCompactCurrency(Number(c.funding))}
                        <span className="ml-2 text-xs">
                          {c.initiatives}
                          <span className="sr-only"> initiatives</span>
                        </span>
                      </span>
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-navy-100" aria-hidden="true">
                      <span className={cn("block h-full rounded-full", selected ? "bg-navy-800" : "bg-navy-600/70 group-hover:bg-navy-600")} style={{ width: `${share}%` }} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <Card>
        <FilterBar action={base} clearHref={buildHref(base, { period: data.period.id })}>
          <FilterField label="Search" htmlFor="q" className="min-w-64 flex-1">
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Code or name" />
          </FilterField>
          <FilterField label="Reporting period" htmlFor="period">
            <Select id="period" name="period" defaultValue={data.period.id}>
              {data.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue={data.category}>
              <option value="">All categories</option>
              {data.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Administering agency" htmlFor="agency">
            <Select id="agency" name="agency" defaultValue={data.agency}>
              <option value="">All agencies</option>
              {data.agencies.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={status}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="retired">Retired</option>
            </Select>
          </FilterField>
        </FilterBar>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Initiative</TH>
              <TH>Category</TH>
              <TH>Agency</TH>
              <TH align="right">Organizations</TH>
              <TH align="right">Total funding</TH>
              <TH>{data.period.label}</TH>
              <TH align="right">Missing</TH>
            </tr>
          </THead>
          <tbody>
            {data.rows.length === 0 ? (
              <EmptyRow colSpan={8}>No initiatives match these filters. Clear the filters to see every initiative.</EmptyRow>
            ) : (
              data.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="whitespace-nowrap font-mono text-[13px] text-muted">{row.code}</TD>
                  <TD>
                    <Link href={`${base}/${row.id}`} className="font-semibold text-navy-700 hover:underline">
                      {row.name}
                    </Link>
                    {row.status === "retired" ? <span className="ml-2"><Badge>Retired</Badge></span> : null}
                  </TD>
                  <TD className="whitespace-nowrap">{row.category}</TD>
                  <TD className="whitespace-nowrap">{row.agency ?? <span className="text-muted">Not set</span>}</TD>
                  <TD align="right">{row.orgs}</TD>
                  <TD align="right">{formatCurrency(Number(row.funding))}</TD>
                  <TD>{row.orgs > 0 ? <ProgressBar value={row.accepted} max={row.orgs} label={`${row.name} accepted reports`} /> : <span className="text-muted">No organizations</span>}</TD>
                  <TD align="right">{row.missing > 0 ? <Badge tone="bad">{row.missing} missing</Badge> : <span className="text-muted">0</span>}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        <Pagination base={base} params={kept} page={page} pageSize={PAGE_SIZE} total={data.total} />
      </Card>
    </>
  );
}
