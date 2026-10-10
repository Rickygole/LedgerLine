import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { replyToSupportRequest } from "@/app/actions/support";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime, nowDate } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { ageMinutes, categoryLabel, dueAt, formatDuration, loadMessages, loadSupport, metTarget, responseMinutes, supportState } from "@/lib/ops/support";
import { ActionForm } from "@/components/ops/action-form";
import { SupportStateBadge, Thread } from "@/components/ops/support-parts";
import { closeSupportRequest } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/field";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Support request" };

export default async function SupportDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser(["finance_admin"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await withClaims(admin.id, async (tx) => {
    const row = await loadSupport(tx, id);
    return row ? { row, messages: await loadMessages(tx, id) } : null;
  });
  if (!data) notFound();
  const { row, messages } = data;
  const now = nowDate();
  const state = supportState({ createdAt: row.created_at, firstResponseAt: row.first_response_at, closedAt: row.closed_at, now });
  const replied = responseMinutes(row.created_at, row.first_response_at);
  const met = metTarget(row.created_at, row.first_response_at);

  return (
    <>
      <PageHeader
        title={`${row.reference}: ${row.subject}`}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Support queue", href: "/finance/support" }, { label: row.reference }]}
        meta={<SupportStateBadge state={state} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Request" />
          <CardBody>
            <DescriptionList
              columns={1}
              items={[
                { label: "From", value: `${row.requester_name} (${row.requester_email})` },
                { label: "Organization", value: row.org_name ?? "Council Finance" },
                { label: "Topic", value: categoryLabel(row.category) },
                { label: "Sent", value: formatDateTime(row.created_at) },
                { label: "Reply due by", value: formatDateTime(dueAt(row.created_at)) },
                {
                  label: "First reply",
                  value:
                    replied === null
                      ? `None yet, waiting ${formatDuration(ageMinutes(row.created_at, now))}`
                      : `${formatDateTime(row.first_response_at)} by ${row.first_responder_name}, after ${formatDuration(replied)} (${met ? "within" : "after"} the target)`,
                },
                { label: "Closed", value: row.closed_at ? formatDateTime(row.closed_at) : "Not closed" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Conversation" />
          <CardBody className="space-y-4">
            <Thread messages={messages} />
            {row.closed_at ? (
              <p className="text-sm text-muted">This request is closed.</p>
            ) : (
              <>
                <ActionForm action={replyToSupportRequest} hidden={{ requestId: row.id }} submitLabel="Send reply" pendingLabel="Sending">
                  <div>
                    <Label htmlFor="reply">Reply to {row.requester_name}</Label>
                    <Textarea id="reply" name="body" maxLength={4000} rows={5} />
                  </div>
                </ActionForm>
                {row.first_response_at ? (
                  <ActionForm action={closeSupportRequest} hidden={{ requestId: row.id }} submitLabel="Close request" pendingLabel="Closing" variant="secondary" resetOnSuccess={false} />
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
