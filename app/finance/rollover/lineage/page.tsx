import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireUser, FINANCE_ROLES } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { one, pageNumber, PAGE_SIZE, type SearchParams } from "@/lib/finance/admin/params";
import { KIND_LABEL, lineageRows, lineageYears } from "@/lib/lifecycle/rollover";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { FilterBar, FilterField } from "@/components/finance/admin/filter-bar";
import { Pagination } from "@/components/finance/admin/pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Initiative lineage" };

const KINDS = ["carried", "renamed", "combined", "retired"] as const;

export default async function LineagePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  const kind = (KINDS as readonly string[]).includes(one(params, "kind")) ? one(params, "kind") : "";
  const q = one(params, "q");
  const year = one(params, "year");
  const page = pageNumber(params);
  const { data, years } = await withClaims(user.id, async (tx) => ({
    data: await lineageRows(tx, { kind, q, year }, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    years: await lineageYears(tx),
  }));
  const base = "/finance/rollover/lineage";

  return (
    <>
      <PageHeader
        title="Initiative lineage"
        description="How each initiative continues from one fiscal year to the next. Renamed and combined initiatives keep a link to their history."
        crumbs={[{ label: "Dashboard", href: "/finance" }, ...(user.role === "finance_admin" ? [{ label: "Annual rollover", href: "/finance/rollover" }] : []), { label: "Lineage" }]}
      />
      <Card>
        <FilterBar action={base} clearHref={base} applied={[kind, year].filter(Boolean).length}>
          <FilterField label="Search" htmlFor="q" className="min-w-64 flex-1">
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Initiative name or code" />
          </FilterField>
          <FilterField label="Change" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue={kind}>
              <option value="">All changes</option>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Rolled into" htmlFor="year">
            <Select id="year" name="year" defaultValue={year}>
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>
        <Table>
          <THead>
            <tr>
              <TH>Earlier initiative</TH>
              <TH>Change</TH>
              <TH>Continues as</TH>
              <TH>Rolled into</TH>
            </tr>
          </THead>
          <tbody>
            {data.rows.length === 0 ? (
              <EmptyRow colSpan={4}>{years.length === 0 ? "No rollover has been run yet. Lineage appears here after the first one." : "No lineage matches these filters."}</EmptyRow>
            ) : (
              data.rows.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <Link href={`/finance/initiatives/${row.predecessor_id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      {row.predecessor_name}
                    </Link>
                    <div className="text-xs text-muted">
                      {row.predecessor_code}, {row.predecessor_year}
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={row.kind === "retired" ? "warn" : row.kind === "carried" ? "neutral" : "info"} icon={row.kind === "retired" ? undefined : ArrowRight}>
                      {KIND_LABEL[row.kind]}
                    </Badge>
                  </TD>
                  <TD>
                    {row.successor_id ? (
                      <>
                        <Link href={`/finance/initiatives/${row.successor_id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                          {row.successor_name}
                        </Link>
                        <div className="text-xs text-muted">
                          {row.successor_code}, {row.successor_year}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted">No successor</span>
                    )}
                  </TD>
                  <TD>{row.fiscal_year_id}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
        <Pagination base={base} params={{ q, kind, year }} page={page} pageSize={PAGE_SIZE} total={data.total} />
      </Card>
    </>
  );
}
