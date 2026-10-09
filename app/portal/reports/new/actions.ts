"use server";

import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { startReport } from "@/lib/report/create";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startReportAction(formData: FormData) {
  const user = await requireUser(["cbo_submitter"]);
  const assignment = String(formData.get("assignment") ?? "");
  const period = String(formData.get("period") ?? "");
  if (!ID.test(assignment) || !/^[A-Za-z0-9-]{3,20}$/.test(period)) notFound();
  const result = await startReport(user.id, assignment, period);
  if (result.status === "not_found") notFound();
  if (result.status === "no_form") redirect(`/portal/reports/new?assignment=${assignment}&period=${period}&closed=1`);
  redirect(`/portal/reports/${result.submissionId}`);
}
