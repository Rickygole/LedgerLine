import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type Role } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { loadReport } from "./data";
import { buildReportPdf, pdfFilename } from "./pdf";
import { loadLatestRevision } from "./revision";
import { contentDisposition } from "./upload-rules";

export async function serveReportPdf(id: string, roles: Role[]): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to download this report." }, { status: 401 });
  if (!roles.includes(user.role)) return NextResponse.json({ error: "You do not have access to this report." }, { status: 403 });
  if (!isUuid(id)) return NextResponse.json({ error: "That report could not be found." }, { status: 404 });
  const loaded = await withClaims(user.id, async (tx) => {
    const report = await loadReport(tx, id);
    if (!report) return null;
    const revision = await loadLatestRevision(tx, id);
    return revision ? { report, revision } : null;
  });
  if (!loaded) return NextResponse.json({ error: "That report has no submitted copy." }, { status: 404 });
  const { report, revision } = loaded;
  const { header } = report;
  const bytes = await buildReportPdf({
    initiativeName: header.initiativeName,
    periodLabel: header.periodLabel,
    referenceNo: header.referenceNo,
    revision: revision.revision,
    revisionKind: revision.kind,
    revisionReason: revision.reason,
    revisionActor: revision.actorName,
    submittedAt: header.submittedAt,
    submittedByName: header.submittedByName,
    orgName: header.orgName,
    ein: header.ein,
    awardAmount: header.awardAmount,
    definition: report.definition,
    snapshot: revision.snapshot,
  });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(pdfFilename(header.referenceNo, revision.revision)),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
