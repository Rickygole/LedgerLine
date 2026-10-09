import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
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
import { categorySummary, listCategories, listInitiatives } from "@/lib/finance/admin/initiatives";
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
    const categories = await listCategories(tx);
    const category = categories.includes(one(params, "category")) ? one(params, "category") : "";
    const list = await listInitiatives(tx, today, { q, category, status, page });
    const summary = await categorySummary(tx, today);
    return { categories, category, summary, ...list };
  });

  const base = "/finance/initiatives";
  const kept = { q, category: data.category, status };

  return (
    <>
      <PageHeader
        title="Initiatives"
        description="Council initiatives, who is funded and how FY26 Year-End reporting is going."
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

      <section aria-label="Totals by category" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {data.summary.map((c) => (
          <Link
            key={c.category}
            href={buildHref(base, { category: c.category })}
            className={`rounded-lg border bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-navy-600/40 hover:bg-navy-50/40 ${data.category === c.category ? "border-navy-700 ring-1 ring-navy-700" : "border-line"}`}
          >
            <p className="text-sm font-semibold text-ink">{c.category}</p>
            <p className="num mt-1 text-lg font-bold text-ink">{formatCompactCurrency(Number(c.funding))}</p>
            <p className="num text-xs text-muted">
              {c.initiatives} initiatives, {c.accepted} of {c.assignments} accepted
            </p>
          </Link>
        ))}
      </section>

      <Card>
        <FilterBar action={base} clearHref={base}>
          <FilterField label="Search" htmlFor="q" className="min-w-64 flex-1">
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Code or name" />
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
              <TH align="right">Organizations</TH>
              <TH align="right">Total funding</TH>
              <TH>FY26 Year-End</TH>
              <TH align="right">Missing</TH>
            </tr>
          </THead>
          <tbody>
            {data.rows.length === 0 ? (
              <EmptyRow colSpan={7}>No initiatives match these filters. Clear the filters to see every initiative.</EmptyRow>
            ) : (
              data.rows.map((row) => (
                <TR key={row.id}>
                  <TD className="font-mono text-xs">{row.code}</TD>
                  <TD>
                    <Link href={`${base}/${row.id}`} className="font-semibold text-navy-800 hover:underline">
                      {row.name}
                    </Link>
                    {row.status === "retired" ? <span className="ml-2"><Badge>Retired</Badge></span> : null}
                  </TD>
                  <TD>{row.category}</TD>
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
