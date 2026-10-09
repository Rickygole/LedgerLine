import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, DescriptionList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { findReport } from "@/lib/report/create";
import { startReportAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Start a report" };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ assignment?: string; period?: string; closed?: string }> }) {
  const user = await requireUser(["cbo_submitter"]);
  const { assignment, period, closed } = await searchParams;
  if (!assignment || !period || !ID.test(assignment) || !/^[A-Za-z0-9-]{3,20}$/.test(period)) notFound();

  const existing = await findReport(user.id, assignment, period);
  if (existing.status === "not_found") notFound();
  if (existing.status === "found") redirect(`/portal/reports/${existing.submissionId}`);

  const details = await withClaims(user.id, (tx) =>
    tx.one<{ initiative: string; period: string; due_on: string; starts_on: string; ends_on: string; published: boolean }>(
      `SELECT i.name AS initiative, rp.label AS period, to_char(rp.due_on, 'YYYY-MM-DD') AS due_on,
              to_char(rp.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(rp.ends_on, 'YYYY-MM-DD') AS ends_on,
              EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published') AS published
       FROM assignment a JOIN initiative i ON i.id = a.initiative_id JOIN reporting_period rp ON rp.fiscal_year_id = i.fiscal_year_id
       WHERE a.id = $1 AND rp.id = $2`,
      [assignment, period]
    )
  );
  if (!details) notFound();

  const crumbs = [{ label: "My reports", href: "/portal" }, { label: "Start a report" }];

  if (!details.published || closed) {
    return (
      <PageHeader
        title="This report is not open yet"
        description="Council Finance has not published the reporting form for this initiative. Check back soon or contact Council Finance."
        crumbs={crumbs}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Start a report" description="Starting a report creates a draft for your organization. You can leave and come back at any time." crumbs={crumbs} />
      <Card>
        <CardBody className="space-y-5">
          <DescriptionList
            columns={2}
            items={[
              { label: "Initiative", value: details.initiative },
              { label: "Reporting period", value: `${details.period} (${formatDate(details.starts_on)} to ${formatDate(details.ends_on)})` },
              { label: "Due", value: formatDate(details.due_on) },
              { label: "Starting as", value: user.fullName },
            ]}
          />
          <form action={startReportAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="assignment" value={assignment} />
            <input type="hidden" name="period" value={period} />
            <Button type="submit">Start report</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
