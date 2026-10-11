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
import { DELIVERY_OFF_NOTICE, deliveryState } from "@/lib/portal/messages";
import { emailDeliveryOn } from "@/lib/email";
import { listOutbox, outboxFilterOptions, templateLabel } from "@/lib/finance/admin/outbox";
import { one, pageNumber, PAGE_SIZE, type SearchParams, isoDate } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Outbox" };

export default async function OutboxPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  const from = isoDate(one(params, "from"));
  const to = isoDate(one(params, "to"));
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
      <PageHeader
        title="Outbox"
        description="Every message LedgerLine has generated, including confirmations, requests for changes, reminders and password resets."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Outbox" }]}
      />
      {emailDeliveryOn() ? null : (
        <p className="mb-4 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">
          {DELIVERY_OFF_NOTICE}
        </p>
      )}
      <Card>
        <FilterBar action={base} clearHref={base} active={[data.template, data.org, from, to].some(Boolean)}>
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
        <Table density="compact" stack>
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
                  <TD className="min-w-[18rem]" primary>
                    <Link
                      href={`${base}/${m.id}`}
                      className="font-semibold text-link underline-offset-2 hover:text-link-hover hover:underline"
                    >
                      {m.subject}
                    </Link>
                  </TD>
                  <TD className="min-w-28" label="Template">
                    <span>{templateLabel(m.template)}</span>
                  </TD>
                  <TD className="max-w-[14rem] text-muted" label="To">
                    <span className="block min-w-0 truncate" title={m.to_email}>
                      {m.to_email}
                    </span>
                  </TD>
                  <TD className="min-w-[12rem]" label="Organization">
                    {m.org_id ? (
                      <Link
                        href={`/finance/organizations/${m.org_id}`}
                        className="text-link underline-offset-2 hover:text-link-hover hover:underline"
                      >
                        {m.org_name}
                      </Link>
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </TD>
                  <TD label="Status">
                    <Badge tone={deliveryState(m.status).tone}>{deliveryState(m.status).label}</Badge>
                  </TD>
                  <TD className="min-w-28" label="Created">
                    <span>{formatDateTime(m.created_at)}</span>
                  </TD>
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
