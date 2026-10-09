import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, DescriptionList } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { loadOutboxMessage, templateLabel } from "@/lib/finance/admin/outbox";
import { isUuid } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Message" };

export default async function OutboxMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(FINANCE_ROLES);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const message = await withClaims(user.id, (tx) => loadOutboxMessage(tx, id));
  if (!message) notFound();

  return (
    <>
      <PageHeader
        title={message.subject}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Outbox", href: "/finance/outbox" }, { label: "Message" }]}
        meta={<Badge tone={message.status === "failed" ? "bad" : message.status === "sent" ? "ok" : "neutral"}>{message.status === "sent" ? "Sent" : message.status === "failed" ? "Failed" : "Queued"}</Badge>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Message body</h2>
            <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-surface/70 p-4 font-mono text-[13px] leading-relaxed text-ink">{message.body_text}</pre>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <DescriptionList
              columns={1}
              items={[
                { label: "To", value: message.to_email },
                { label: "Template", value: templateLabel(message.template) },
                { label: "Created", value: formatDateTime(message.created_at) },
                { label: "Created by", value: message.created_by_name ?? "System" },
                { label: "Organization", value: message.org_id ? <Link href={`/finance/organizations/${message.org_id}`} className="font-semibold text-navy-800 hover:underline">{message.org_name}</Link> : null },
                { label: "Related report", value: message.submission_id ? <Link href={`/finance/submissions/${message.submission_id}`} className="font-mono text-xs font-semibold text-navy-800 hover:underline">{message.reference_no}</Link> : null },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
