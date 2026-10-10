import { serveReportPdf } from "@/lib/report/pdf-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveReportPdf(id, ["cbo_submitter"]);
}
