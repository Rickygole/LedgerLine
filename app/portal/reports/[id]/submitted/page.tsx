import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { loadReport } from "@/lib/report/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Report submitted" };

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
    <div className="mx-auto max-w-[760px] space-y-8">
      <div className="rounded bg-ok px-6 py-10 text-center text-white sm:px-8">
        <h1 className="text-[28px] font-extrabold leading-9 tracking-[-0.015em] sm:text-[32px] sm:leading-10">Report submitted</h1>
        <p className="mt-2 text-base text-white">
          {header.initiativeName}, {header.periodLabel}
        </p>
        <p className="mt-6 text-lg">Your reference number</p>
        <p className="num mt-1 break-all font-mono text-[24px] font-bold tracking-wide sm:text-[28px]">{header.referenceNo}</p>
      </div>

      <div className="max-w-[70ch] space-y-4 text-base leading-7 text-ink">
        <p>
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
        <dl className="grid gap-x-6 gap-y-3 border-y border-[#e3e7ec] py-4 text-[15px] sm:grid-cols-3">
          <div>
            <dt className="text-sm font-semibold text-muted">Submitted</dt>
            <dd className="mt-0.5">{formatDateTime(header.submittedAt)} ET</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-muted">Submitted by</dt>
            <dd className="mt-0.5">{header.submittedByName ?? user.fullName}</dd>
          </div>
          <div>
            <dt className="text-sm font-semibold text-muted">Revision</dt>
            <dd className="num mt-0.5">{header.revision}</dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="next-heading" className="max-w-[70ch]">
        <h2 id="next-heading" className="text-xl font-bold leading-7 text-ink">
          What happens next
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6 text-base leading-7 text-ink marker:font-semibold">
          <li>Council Finance reviews your report. Reports are reviewed in the order received.</li>
          <li>If they need changes, the request appears in Messages and the report reopens for you to update.</li>
          <li>
            When it is accepted, its status changes to Accepted on{" "}
            <Link href="/portal" className="text-link underline underline-offset-2 hover:text-link-hover">
              My reports
            </Link>
            .
          </li>
        </ol>
      </section>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <ButtonLink href={`/portal/reports/${id}`} variant="secondary" className="h-11 px-5 text-base">
          View or print the submitted report
        </ButtonLink>
        <Link href="/portal" className="text-base font-semibold text-link underline underline-offset-2 hover:text-link-hover">
          Back to my reports
        </Link>
      </div>
    </div>
  );
}
