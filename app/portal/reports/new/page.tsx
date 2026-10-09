import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { startReport } from "@/lib/report/create";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Start a report" };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ assignment?: string; period?: string }> }) {
  const user = await requireUser(["cbo_submitter"]);
  const { assignment, period } = await searchParams;
  if (!assignment || !period || !ID.test(assignment) || !/^[A-Za-z0-9-]{3,20}$/.test(period)) notFound();

  const result = await startReport(user.id, assignment, period);
  if (result.status === "not_found") notFound();
  if (result.status === "no_form") {
    return (
      <PageHeader
        title="This report is not open yet"
        description="Council Finance has not published the reporting form for this initiative. Check back soon or contact Council Finance."
        crumbs={[{ label: "My reports", href: "/portal" }, { label: "Start a report" }]}
      />
    );
  }
  redirect(`/portal/reports/${result.submissionId}`);
}
