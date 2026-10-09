import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { DELIVERY_OFF_NOTICE, deliveryState, templateLabel } from "@/lib/portal/messages";
import { emailDeliveryOn } from "@/lib/email";

export const metadata: Metadata = { title: "Messages" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { id: string; subject: string; template: string; to_email: string; created_at: string; status: string; submission_id: string | null; reference_no: string | null };

export default async function MessagesPage() {
  const user = await requireUser(["cbo_submitter"]);
  const rows = await withClaims(user.id, (tx) =>
    tx.query<Row>(
      `SELECT o.id, o.subject, o.template, o.to_email, o.created_at, o.status, o.submission_id, s.reference_no
       FROM outbox o LEFT JOIN submission s ON s.id = o.submission_id
       WHERE o.org_id = $1
       ORDER BY o.created_at DESC`,
      [user.orgId]
    )
  );
  return (
    <>
      <PageHeader
        title="Messages"
        description="Copies of the messages LedgerLine has generated for your organization, such as submission confirmations and update requests."
        crumbs={[{ label: "Portal", href: "/portal" }, { label: "Messages" }]}
      />
      {emailDeliveryOn() ? null : <p className="mb-4 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink">{DELIVERY_OFF_NOTICE}</p>}
      <Card>
        <CardHeader title="Messages" description={`${rows.length} ${rows.length === 1 ? "message" : "messages"}, newest first.`} />
        <Table stack>
          <THead>
            <tr>
              <TH>Subject</TH>
              <TH>Type</TH>
              <TH>To</TH>
              <TH>Date</TH>
              <TH>Delivery</TH>
              <TH>Related report</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>No messages yet. A confirmation email appears here after you submit a report.</EmptyRow>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD primary>
                    <Link href={`/portal/messages/${r.id}`} className="flex items-center gap-2 font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      <Mail className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      {r.subject}
                    </Link>
                  </TD>
                  <TD label="Type">
                    <Badge tone="neutral">{templateLabel(r.template)}</Badge>
                  </TD>
                  <TD label="To" className="break-all">{r.to_email}</TD>
                  <TD className="whitespace-nowrap" label="Date">{formatDateTime(r.created_at)}</TD>
                  <TD label="Delivery">
                    <Badge tone={deliveryState(r.status).tone}>{deliveryState(r.status).label}</Badge>
                  </TD>
                  <TD label="Related report">
                    {r.submission_id ? (
                      <Link href={`/portal/reports/${r.submission_id}`} className="whitespace-nowrap font-mono text-[13px] font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                        {r.reference_no}
                      </Link>
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
