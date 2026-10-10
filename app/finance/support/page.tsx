import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { one, pickOne, type SearchParams } from "@/lib/finance/admin/params";
import { ageMinutes, categoryLabel, formatDuration, listSupport, metTarget, responseMinutes, RESPONSE_TARGET_HOURS, supportState, targetSummary } from "@/lib/ops/support";
import { SupportStateBadge } from "@/components/ops/support-parts";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support queue" };

const FILTERS = ["all", "open", "overdue", "responded", "closed"] as const;

export default async function SupportQueue({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireUser(["finance_admin"]);
  const params = await searchParams;
  const filter = pickOne(one(params, "state"), FILTERS, "all");
  const now = new Date();
  const all = await withClaims(admin.id, (tx) => listSupport(tx, {}));
  const rows = all.map((row) => ({ row, state: supportState({ createdAt: row.created_at, firstResponseAt: row.first_response_at, closedAt: row.closed_at, now }) }));
  const count = (state: string) => rows.filter((r) => r.state === state).length;
  const shown = rows.filter((r) => filter === "all" || r.state === filter);
  const summary = targetSummary(all.map((r) => ({ createdAt: r.created_at, firstResponseAt: r.first_response_at })));
  const share = summary.responded === 0 ? "No replies yet" : `${Math.round((summary.metTarget / summary.responded) * 100)}% of ${summary.responded} replies`;

  return (
    <>
      <PageHeader
        title="Support queue"
        description={`Help requests from every signed-in user, measured against the ${RESPONSE_TARGET_HOURS} hour first response target. A request is overdue when ${RESPONSE_TARGET_HOURS} hours pass with no reply.`}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Support queue" }]}
      />
      <p className="mb-4 text-sm">
        {count("open")} open, {count("overdue")} overdue, {count("responded")} responded and waiting to be closed. First replies within the target: {share}. Median first reply: {summary.medianMinutes === null ? "none yet" : formatDuration(summary.medianMinutes)}.
      </p>
      <Card>
        <form action="/finance/support" className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4">
          <div>
            <Label htmlFor="state">Show</Label>
            <Select id="state" name="state" defaultValue={filter}>
              <option value="all">All requests</option>
              <option value="open">Open</option>
              <option value="overdue">Overdue</option>
              <option value="responded">Responded</option>
              <option value="closed">Closed</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Reference</TH>
              <TH>Requester</TH>
              <TH>Subject</TH>
              <TH>Status</TH>
              <TH>Sent</TH>
              <TH>Age or first reply</TH>
            </tr>
          </THead>
          <tbody>
            {shown.length === 0 ? (
              <EmptyRow colSpan={6}>No requests match this filter.</EmptyRow>
            ) : (
              shown.map(({ row, state }) => {
                const replied = responseMinutes(row.created_at, row.first_response_at);
                return (
                  <TR key={row.id}>
                    <TD className="whitespace-nowrap font-semibold">{row.reference}</TD>
                    <TD>
                      <div className="font-semibold">{row.requester_name}</div>
                      <div className="text-xs text-muted">{row.org_name ?? "Council Finance"}</div>
                    </TD>
                    <TD>
                      <Link href={`/finance/support/${row.id}`} className="text-link underline underline-offset-2 hover:text-link-hover">
                        {row.subject}
                      </Link>
                      <div className="text-xs text-muted">{categoryLabel(row.category)}</div>
                    </TD>
                    <TD>
                      <SupportStateBadge state={state} />
                    </TD>
                    <TD className="whitespace-nowrap text-muted">{formatDateTime(row.created_at)}</TD>
                    <TD className="whitespace-nowrap">
                      {replied === null ? (
                        <span className={state === "overdue" ? "font-semibold text-bad" : undefined}>{formatDuration(ageMinutes(row.created_at, now))} waiting</span>
                      ) : (
                        <span>
                          {formatDuration(replied)}
                          {metTarget(row.created_at, row.first_response_at) === false ? <span className="ml-1 font-semibold text-bad">(late)</span> : null}
                        </span>
                      )}
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
