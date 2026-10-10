import type { Metadata } from "next";
import { Fragment } from "react";
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
import { AuditSentence } from "@/components/finance/admin/audit-line";
import { actionLabel, auditFilterOptions, entityLabel, listAudit } from "@/lib/finance/admin/audit";
import { one, pageNumber, PAGE_SIZE, type SearchParams, isoDate } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit log" };

const DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const dayLabel = (at: string | Date) => DAY.format(new Date(at));
const timeLabel = (at: string | Date) => TIME.format(new Date(at));

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  const from = isoDate(one(params, "from"));
  const to = isoDate(one(params, "to"));
  const page = pageNumber(params);

  const data = await withClaims(user.id, async (tx) => {
    const options = await auditFilterOptions(tx);
    const actor = options.actors.some((a) => a.id === one(params, "actor")) ? one(params, "actor") : "";
    const entity = options.entities.includes(one(params, "entity")) ? one(params, "entity") : "";
    const action = options.actions.includes(one(params, "action")) ? one(params, "action") : "";
    const list = await listAudit(tx, { actor, entity, action, from, to, page });
    return { options, actor, entity, action, ...list };
  });

  const base = "/finance/audit";
  const kept = { actor: data.actor, entity: data.entity, action: data.action, from, to };

  return (
    <>
      <PageHeader
        title="Audit log"
        description="A permanent record of who did what and when. Entries cannot be edited or removed."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Audit log" }]}
      />
      <Card>
        <FilterBar
          action={base}
          clearHref={base}
          keep={0}
          applied={[data.actor, data.entity, data.action, from, to].filter(Boolean).length}
        >
          <FilterField label="Actor" htmlFor="actor" className="min-w-48">
            <Select id="actor" name="actor" defaultValue={data.actor}>
              <option value="">Everyone</option>
              {data.options.actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Entity" htmlFor="entity">
            <Select id="entity" name="entity" defaultValue={data.entity}>
              <option value="">All entities</option>
              {data.options.entities.map((e) => (
                <option key={e} value={e}>
                  {entityLabel(e)}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Action" htmlFor="action">
            <Select id="action" name="action" defaultValue={data.action}>
              <option value="">All actions</option>
              {data.options.actions.map((a) => (
                <option key={a} value={a}>
                  {actionLabel(a)}
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
        <Table className="max-h-[72vh]">
          <THead>
            <tr>
              <TH>Time</TH>
              <TH>What happened</TH>
              <TH>Organization</TH>
              <TH>Entity</TH>
            </tr>
          </THead>
          <tbody>
            {data.rows.length === 0 ? (
              <EmptyRow colSpan={4}>No audit entries match these filters.</EmptyRow>
            ) : (
              data.rows.map((row, index) => {
                const day = dayLabel(row.at);
                const newDay = index === 0 || dayLabel(data.rows[index - 1].at) !== day;
                return (
                  <Fragment key={row.id}>
                    {newDay ? (
                      <tr>
                        <th
                          colSpan={4}
                          scope="colgroup"
                          className="sticky top-9 z-[5] border-b border-line bg-navy-50 px-4 py-1.5 text-left text-xs font-semibold text-navy-900"
                        >
                          {day}
                        </th>
                      </tr>
                    ) : null}
                    <TR>
                      <TD className="whitespace-nowrap align-top text-muted">
                        <time dateTime={new Date(row.at).toISOString()} title={formatDateTime(row.at)} className="num">
                          {timeLabel(row.at)}
                        </time>
                      </TD>
                      <TD className="max-w-xl align-top">
                        <AuditSentence row={row} />
                        {row.note ? <p className="mt-1 text-muted">Note: {row.note}</p> : null}
                      </TD>
                      <TD className="align-top">{row.org_name ?? <span className="sr-only">None</span>}</TD>
                      <TD className="align-top">
                        <Badge>{entityLabel(row.entity)}</Badge>
                      </TD>
                    </TR>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </Table>
        <Pagination base={base} params={kept} page={page} pageSize={PAGE_SIZE} total={data.total} />
      </Card>
    </>
  );
}
