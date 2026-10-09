import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ReportEditor } from "@/components/report/report-editor";
import { ReportHeader } from "@/components/report/report-header";
import { SubmittedCopy } from "@/components/report/submitted-copy";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { loadEditorPayload, loadReport } from "@/lib/report/data";
import { loadFileIds, loadLatestRevision, loadReturnNote } from "@/lib/report/revision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Report" };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const user = await requireUser(["cbo_submitter"]);

  const data = await withClaims(user.id, async (tx) => {
    const report = await loadReport(tx, id);
    if (!report) return null;
    const editable = report.header.status === "draft" || report.header.status === "returned";
    if (editable) {
      const payload = await loadEditorPayload(tx, report, user.fullName, user.title ?? "");
      const note = report.header.status === "returned" ? await loadReturnNote(tx, id) : null;
      return { kind: "edit" as const, report, payload, note };
    }
    const revision = await loadLatestRevision(tx, id);
    const files = await loadFileIds(tx, id);
    return { kind: "view" as const, report, revision, files };
  });
  if (!data) notFound();

  const { header } = data.report;

  if (data.kind === "view") {
    return (
      <>
        <ReportHeader header={header} />
        {data.revision ? (
          <SubmittedCopy definition={data.report.definition} revision={data.revision} awardAmount={header.awardAmount} submissionId={id} files={data.files} />
        ) : (
          <p className="text-sm text-muted">The submitted copy is not available yet.</p>
        )}
      </>
    );
  }

  return (
    <>
      <ReportHeader header={header} />
      {data.note ? (
        <section aria-labelledby="changes-requested" className="mb-6 rounded-lg border border-l-4 border-line border-l-warn bg-white px-5 py-4 shadow-card">
          <h2 id="changes-requested" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <AlertTriangle className="h-4 w-4 text-warn" aria-hidden="true" />
            Council Finance asked for changes
          </h2>
          <p className="mt-2 max-w-[72ch] whitespace-pre-wrap rounded-md bg-surface px-3 py-2.5 text-sm leading-6 text-ink">{data.note.note}</p>
          <p className="mt-2 text-xs text-muted">
            {data.note.by ? `${data.note.by}, Council Finance` : "Council Finance"}, {formatDateTime(data.note.at)} ET. Update the report below, then submit it again.
          </p>
        </section>
      ) : null}
      <ReportEditor payload={data.payload} />
    </>
  );
}
