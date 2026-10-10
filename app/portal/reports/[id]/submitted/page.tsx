import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
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
      <div className="mb-6 rounded border-4 border-ok bg-white px-6 py-7 text-center">
        <h1 className="text-[1.75rem] font-bold leading-9 text-ink">Report received</h1>
        <p className="mt-1 text-sm text-muted">
          {header.initiativeName}, {header.periodLabel}
        </p>
        <p className="mt-5 text-base text-ink">Your reference number</p>
        <p className="num mt-1 break-all font-mono text-2xl font-bold text-ink">{header.referenceNo}</p>
      </div>
      <p className="mb-6 text-base leading-7 text-ink">
        A copy of this report is in{" "}
        <Link href="/portal/messages" className="text-link underline underline-offset-2 hover:text-link-hover">
          Messages
        </Link>
        {copy?.status === "sent" ? (
          <>
            {" "}and was emailed to <span className="break-all font-semibold">{user.email}</span>
          </>
        ) : null}
        . Keep your reference number in case you need to contact Council Finance.
      </p>
      <Card>
        <CardBody className="space-y-5">
          <DescriptionList
            columns={2}
            items={[
              { label: "Submitted", value: `${formatDateTime(header.submittedAt)} ET` },
              { label: "Submitted by", value: header.submittedByName ?? user.fullName },
              { label: "Revision", value: <span className="num">{header.revision}</span> },
            ]}
          />
        </CardBody>
      </Card>
      <section aria-labelledby="next-heading" className="mt-8">
        <h2 id="next-heading" className="text-xl font-bold text-ink">
          What happens next
        </h2>
        <p className="mt-2 text-base leading-7 text-ink">
          Council Finance reviews reports in the order received. If anything needs to change, the request appears in Messages. You can check the status in{" "}
          <Link href="/portal" className="text-link underline underline-offset-2 hover:text-link-hover">
            My reports
          </Link>
          .
        </p>
      </section>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href={`/portal/reports/${id}`}>View submitted copy</ButtonLink>
        <ButtonLink href="/portal" variant="secondary">
          Back to my reports
        </ButtonLink>
      </div>
    </div>
  );
}
