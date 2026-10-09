import type { Metadata } from "next";
import Link from "next/link";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { FilterBar, FilterField } from "@/components/finance/admin/filter-bar";
import { Pagination } from "@/components/finance/admin/pagination";
import { listOutbox, outboxFilterOptions, templateLabel } from "@/lib/finance/admin/outbox";
import { one, pageNumber, PAGE_SIZE, type SearchParams } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Outbox" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function OutboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  const from = DATE.test(one(params, "from")) ? one(params, "from") : "";
  const to = DATE.test(one(params, "to")) ? one(params, "to") : "";
  const page = pageNumber(params);

  const data = await withClaims(user.id, async (tx) => {
    const options = await outboxFilterOptions(tx);
    const template = options.templates.includes(one(params, "template")) ? one(params, "template") : "";
    const org = options.orgs.some((o) => o.id === one(params, "org")) ? one(params, "org") : "";
    const list = await listOutbox(tx, { template, org, from, to, page });
    return { options, template, org, ...list };
  });

  const base = "/finance/outbox";
  const kept = { template: data.template, org: data.org, from, to };

  return (
    <>
      <PageHeader title="Outbox" description="Every email LedgerLine would send. Nothing leaves this demonstration; messages are stored here so you can read them." crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Outbox" }]} />
      <Card>
        <FilterBar action={base} clearHref={base}>
          <FilterField label="Template" htmlFor="template">
            <Select id="template" name="template" defaultValue={data.template}>
              <option value="">All templates</option>
              {data.options.templates.map((t) => (
                <option key={t} value={t}>
                  {templateLabel(t)}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Organization" htmlFor="org" className="min-w-56">
            <Select id="org" name="org" defaultValue={data.org}>
              <option value="">All organizations</option>
              {data.options.orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.legal_name}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="From" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={from} />
          </FilterField>
          <FilterField label="To" htmlFor="to">
            <Input id="to" name="to" type="date" defaultValue={to} />
          </FilterField>
        </FilterBar>
        <Table>
          <THead>
            <tr>
              <TH>Subject</TH>
              <TH>Template</TH>
              <TH>To</TH>
              <TH>Organization</TH>
              <TH>Status</TH>
              <TH>Created</TH>
            </tr>
          </THead>
          <tbody>
            {data.rows.length === 0 ? (
              <EmptyRow colSpan={6}>No messages match these filters.</EmptyRow>
            ) : (
              data.rows.map((m) => (
                <TR key={m.id}>
                  <TD className="max-w-md">
                    <Link href={`${base}/${m.id}`} className="font-semibold text-navy-700 hover:underline">
                      {m.subject}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap">{templateLabel(m.template)}</TD>
                  <TD className="text-muted">{m.to_email}</TD>
                  <TD>
                    {m.org_id ? (
                      <Link href={`/finance/organizations/${m.org_id}`} className="hover:underline">
                        {m.org_name}
                      </Link>
                    ) : (
                      <span className="text-muted">Not tied to an organization</span>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={m.status === "failed" ? "bad" : m.status === "sent" ? "ok" : "neutral"}>{m.status === "sent" ? "Sent" : m.status === "failed" ? "Failed" : "Queued"}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap">{formatDateTime(m.created_at)}</TD>
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
