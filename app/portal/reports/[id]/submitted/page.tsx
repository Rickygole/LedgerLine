import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
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
              { label: "Reference number", value: <span className="num font-semibold">{header.referenceNo}</span> },
              { label: "Revision", value: <span className="num">{header.revision}</span> },
              { label: "Submitted by", value: header.submittedByName ?? user.fullName },
            ]}
          />
          <p className="rounded-md bg-surface px-4 py-3 text-sm text-ink">We will email you if Finance needs changes. A copy of this report was sent to {user.email}.</p>
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
