import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink, Play, Trash2 } from "lucide-react";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { one, type SearchParams } from "@/lib/finance/admin/params";
import { cleanParams, countMatches, describe, exportHref, listSaved, queryOptions, resultsHref } from "@/lib/lifecycle/queries";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { QueryBuilder } from "@/components/finance/lifecycle/query-builder";
import { deleteQuery } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved queries" };

export default async function QueriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const raw = await searchParams;
  const { options, params, count, saved } = await withClaims(user.id, async (tx) => {
    const options = await queryOptions(tx);
    const params = cleanParams(raw, options.periods.map((p) => p.id));
    return { options, params, count: await countMatches(tx, params), saved: await listSaved(tx) };
  });
  const lines = describe(params);

  return (
    <>
      <PageHeader
        title="Saved queries"
        description="Build a question about reports, see how many reports match, then open the results or export them. Saved queries are private to you."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Saved queries" }]}
      />
      {one(raw, "saved") === "1" ? <p role="status" className="mb-4 rounded-md border border-ok/30 bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">Query saved.</p> : null}
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <Card className="lg:col-span-8">
            <CardHeader title="Query builder" description="Choose any combination of criteria. The count updates as you change them." />
            <CardBody>
              <QueryBuilder params={params} periods={options.periods} categories={options.categories} initiatives={options.initiatives} />
            </CardBody>
          </Card>
          <Card className="border-l-[3px] border-l-navy-600 lg:sticky lg:top-4 lg:col-span-4">
            <CardBody className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Matching reports</p>
                <p className="num mt-1 text-[28px] font-bold leading-8 text-ink" aria-live="polite" data-testid="match-count">
                  {count}
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted">Criteria</p>
                <div className="flex flex-wrap gap-1.5">
                  {lines.map((line) => (
                    <Badge key={line} tone="info">
                      {line}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <ButtonLink href={resultsHref(params)} className="flex-1">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open results
                </ButtonLink>
                <ButtonLink href={exportHref(params)} variant="secondary" className="flex-1">
                  <Download className="h-4 w-4" aria-hidden="true" /> Export Excel
                </ButtonLink>
              </div>
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Your saved queries" description="Only you can see these." />
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Criteria</TH>
                <TH>Saved</TH>
                <TH>Actions</TH>
              </tr>
            </THead>
            <tbody>
              {saved.length === 0 ? (
                <EmptyRow colSpan={4}>You have not saved a query yet. Build one above and give it a name.</EmptyRow>
              ) : (
                saved.map((q) => {
                  const p = cleanParams(q.params, options.periods.map((x) => x.id));
                  return (
                    <TR key={q.id} className="align-top">
                      <TD className="font-semibold">{q.name}</TD>
                      <TD>
                        <div className="flex flex-wrap gap-1.5">
                          {describe(p).map((line) => (
                            <Badge key={line}>{line}</Badge>
                          ))}
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap text-muted">{formatDate(q.created_at.slice(0, 10))}</TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-2">
                          <ButtonLink href={resultsHref(p)} variant="secondary" size="sm">
                            <Play className="h-3.5 w-3.5" aria-hidden="true" /> Run
                          </ButtonLink>
                          <Link href={`/finance/queries?${new URLSearchParams(p as Record<string, string>).toString()}`} className="text-sm font-semibold text-navy-800 hover:underline">
                            Edit
                          </Link>
                          <form action={deleteQuery}>
                            <input type="hidden" name="id" value={q.id} />
                            <Button type="submit" variant="ghost" size="sm" aria-label={`Delete ${q.name}`}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                            </Button>
                          </form>
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
