import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { REDIRECTED_SQL, deliveryNotice, deliveryState, templateLabel } from "@/lib/portal/messages";

export const metadata: Metadata = { title: "Messages" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  subject: string;
  template: string;
  to_email: string;
  created_at: string;
  status: string;
  submission_id: string | null;
  reference_no: string | null;
  redirected: boolean;
};

export default async function MessagesPage() {
  const user = await requireUser(["cbo_submitter"]);
  const rows = await withClaims(user.id, (tx) =>
    tx.query<Row>(
      `SELECT o.id, o.subject, o.template, o.to_email, o.created_at, o.status, o.submission_id, s.reference_no, ${REDIRECTED_SQL} AS redirected
       FROM outbox o LEFT JOIN submission s ON s.id = o.submission_id
       WHERE o.org_id = $1
       ORDER BY o.created_at DESC`,
      [user.orgId],
    ),
  );
  const addresses = new Set(rows.map((r) => r.to_email));
  const statuses = new Set(rows.map((r) => r.status));
  const sharedTo = addresses.size === 1 ? rows[0].to_email : null;
  const showTo = addresses.size > 1;
  const showDelivery = statuses.size > 1;
  const allSent = statuses.size === 1 && statuses.has("sent");
  const allRedirected = allSent && rows.every((r) => r.redirected);
  const description =
    [
      sharedTo ? `Addressed to ${sharedTo}.` : null,
      allSent ? (allRedirected ? "Each one was emailed to the review inbox." : "Each one was emailed.") : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const notice = deliveryNotice();
  const columns = 4 + (showTo ? 1 : 0) + (showDelivery ? 1 : 0);
  return (
    <>
      <PageHeader eyebrow={user.orgName ?? "Your organization"} title="Messages" description={description} />
      {notice ? (
        <p className="mb-6 max-w-[70ch] rounded border border-l-4 border-line border-l-action bg-white px-5 py-4 text-[15px] text-ink">
          {notice}
        </p>
      ) : null}
      <Card>
        <Table stack>
          <THead>
            <tr>
              <TH>Subject</TH>
              <TH>Type</TH>
              {showTo ? <TH>To</TH> : null}
              <TH>Date</TH>
              {showDelivery ? <TH>Delivery</TH> : null}
              <TH>Related report</TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={columns}>No messages yet. A copy of each report you submit appears here.</EmptyRow>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD primary>
                    <Link
                      href={`/portal/messages/${r.id}`}
                      className="font-semibold text-link underline-offset-2 hover:text-link-hover hover:underline"
                    >
                      {r.subject}
                    </Link>
                  </TD>
                  <TD label="Type" className="text-ink-2">
                    {templateLabel(r.template)}
                  </TD>
                  {showTo ? (
                    <TD label="To" className="break-all">
                      {r.to_email}
                    </TD>
                  ) : null}
                  <TD className="whitespace-nowrap" label="Date">
                    {formatDateTime(r.created_at)}
                  </TD>
                  {showDelivery ? (
                    <TD label="Delivery">
                      <Badge tone={deliveryState(r.status, r.redirected).tone}>
                        {deliveryState(r.status, r.redirected).label}
                      </Badge>
                    </TD>
                  ) : null}
                  <TD label="Related report">
                    {r.submission_id ? (
                      <Link
                        href={`/portal/reports/${r.submission_id}`}
                        className="whitespace-nowrap font-mono text-[13px] font-semibold text-link underline-offset-2 hover:text-link-hover hover:underline"
                      >
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
