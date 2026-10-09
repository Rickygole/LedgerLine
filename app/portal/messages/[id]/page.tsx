import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { templateLabel } from "@/lib/portal/messages";

export const metadata: Metadata = { title: "Message" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = { id: string; subject: string; template: string; to_email: string; body_text: string; created_at: string; submission_id: string | null; reference_no: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MessageDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["cbo_submitter"]);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const row = await withClaims(user.id, (tx) =>
    tx.one<Row>(
      `SELECT o.id, o.subject, o.template, o.to_email, o.body_text, o.created_at, o.submission_id, s.reference_no
       FROM outbox o LEFT JOIN submission s ON s.id = o.submission_id
       WHERE o.id = $1 AND o.org_id = $2`,
      [id, user.orgId]
    )
  );
  if (!row) notFound();
  return (
    <>
      <PageHeader
        title={row.subject}
        crumbs={[{ label: "Portal", href: "/portal" }, { label: "Messages", href: "/portal/messages" }, { label: "Message" }]}
        actions={
          row.submission_id ? (
            <ButtonLink href={`/portal/reports/${row.submission_id}`} variant="secondary">
              View report {row.reference_no}
            </ButtonLink>
          ) : null
        }
      />
      <Card>
        <CardHeader title="Message details" />
        <CardBody>
          <DescriptionList
            columns={3}
            items={[
              { label: "Sent to", value: row.to_email },
              { label: "Sent", value: formatDateTime(row.created_at) },
              { label: "Type", value: templateLabel(row.template) },
            ]}
          />
        </CardBody>
        <CardBody className="border-t border-line">
          <p className="mb-2 text-[13px] font-semibold text-muted">Message text</p>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-line bg-surface p-4 font-mono text-sm leading-6 text-ink">{row.body_text}</pre>
        </CardBody>
      </Card>
      <p className="mt-4 text-sm">
        <Link href="/portal/messages" className="text-link underline underline-offset-2 hover:text-link-hover">
          Back to all messages
        </Link>
      </p>
    </>
  );
}
