import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, DescriptionList } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { loadReport } from "@/lib/report/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Report received" };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SubmittedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const user = await requireUser(["cbo_submitter"]);
  const report = await withClaims(user.id, (tx) => loadReport(tx, id));
  if (!report) notFound();
  const { header } = report;
  const copy = await withClaims(user.id, (tx) =>
    tx.one<{ status: string }>("SELECT status FROM outbox WHERE submission_id = $1 AND template = 'submission_confirmation' ORDER BY created_at DESC LIMIT 1", [id])
  );
  if (header.status === "draft" || !header.submittedAt) redirect(`/portal/reports/${id}`);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok-bg text-ok">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Report received</h1>
        <p className="mt-1 text-sm text-muted">
          {header.initiativeName}, {header.periodLabel}
        </p>
      </div>
      <Card>
        <CardBody className="space-y-5">
          <DescriptionList
            columns={2}
            items={[
              { label: "Submitted", value: `${formatDateTime(header.submittedAt)} ET` },
              { label: "Reference number", value: <span className="num whitespace-nowrap font-mono text-[13px] font-semibold">{header.referenceNo}</span> },
              { label: "Revision", value: <span className="num">{header.revision}</span> },
              { label: "Submitted by", value: header.submittedByName ?? user.fullName },
            ]}
          />
          <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm leading-6 text-ink">
            If Finance needs changes, the request appears in Messages. A copy of this report is in{" "}
            <Link href="/portal/messages" className="text-link underline underline-offset-2 hover:text-link-hover">
              Messages
            </Link>
            {copy?.status === "sent" ? ` and was emailed to ${user.email}` : ""}.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={`/portal/reports/${id}`}>View submitted copy</ButtonLink>
            <ButtonLink href="/portal" variant="secondary">
              Back to my reports
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
