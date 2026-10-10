import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageTitle } from "@/components/portal/page-title";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Segmented } from "@/components/portal/portal-filters";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { STATUS_LABEL } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Submission history" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  reference_no: string;
  initiative_id: string;
  initiative_name: string;
  period_id: string;
  period_label: string;
  status: string;
  revision: number;
  submitted_by_name: string | null;
  submitted_at: string | null;
};

const TONE: Record<string, Tone> = { draft: "neutral", submitted: "info", under_review: "info", returned: "warn", accepted: "ok" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ initiative?: string; period?: string }> }) {
  const user = await requireUser(["cbo_submitter"]);
  const params = await searchParams;
  const rows = await withClaims(user.id, (tx) =>
    tx.query<Row>(
      `SELECT s.id, s.reference_no, i.id AS initiative_id, i.name AS initiative_name, p.id AS period_id, p.label AS period_label,
              s.status, s.revision, u.full_name AS submitted_by_name, s.submitted_at
       FROM submission s
       JOIN assignment a ON a.id = s.assignment_id
       JOIN initiative i ON i.id = a.initiative_id
       JOIN reporting_period p ON p.id = s.period_id
       LEFT JOIN app_user u ON u.id = s.submitted_by
       WHERE a.org_id = $1 AND s.submitted_at IS NOT NULL
       ORDER BY s.submitted_at DESC`,
      [user.orgId]
    )
  );
  const initiatives = Array.from(new Map(rows.map((r) => [r.initiative_id, r.initiative_name])).entries());
  const periods = Array.from(new Map(rows.map((r) => [r.period_id, r.period_label])).entries());
  const initiative = initiatives.some(([id]) => id === params.initiative) ? params.initiative! : "all";
  const period = periods.some(([id]) => id === params.period) ? params.period! : "all";
  const shown = rows.filter((r) => (initiative === "all" || r.initiative_id === initiative) && (period === "all" || r.period_id === period));
  const base = (omit: "initiative" | "period") => {
    const out: Record<string, string> = {};
    if (omit !== "initiative" && initiative !== "all") out.initiative = initiative;
    if (omit !== "period" && period !== "all") out.period = period;
    return out;
  };

  return (
    <>
      <PageTitle
        eyebrow={user.orgName ?? "Your organization"}
        title="Submission history"
        lede="Every report your organization has submitted, including reports submitted by your colleagues."
      />
      <Card>
        <CardHeader
          title="Submitted reports"
          description={`${shown.length} of ${rows.length} shown. Newest first.`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Segmented label="Filter by period" param="period" base={base("period")} current={period} options={[{ value: "all", label: "All periods" }, ...periods.map(([id, label]) => ({ value: id, label }))]} />
            </div>
          }
        />
        {initiatives.length > 0 ? (
          <CardBody className="border-b border-line py-3">
            <Segmented label="Filter by initiative" param="initiative" base={base("initiative")} current={initiative} options={[{ value: "all", label: "All initiatives" }, ...initiatives.map(([id, name]) => ({ value: id, label: name }))]} />
          </CardBody>
        ) : null}
        <Table stack>
          <THead>
            <tr>
              <TH>Reference</TH>
              <TH>Initiative</TH>
              <TH>Period</TH>
              <TH>Status</TH>
              <TH align="right">Revision</TH>
              <TH>Submitted by</TH>
              <TH>Submitted</TH>
              <TH>
                <span className="sr-only">View</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {shown.length === 0 ? (
              <EmptyRow colSpan={8}>{rows.length === 0 ? "No reports have been submitted yet. Submitted reports appear here." : "No submitted reports match these filters."}</EmptyRow>
            ) : (
              shown.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/portal/reports/${r.id}`} className="whitespace-nowrap font-mono text-[13px] font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      {r.reference_no}
                    </Link>
                  </TD>
                  <TD primary>{r.initiative_name}</TD>
                  <TD label="Period">{r.period_label}</TD>
                  <TD label="Status">
                    <Badge tone={TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  </TD>
                  <TD align="right" label="Revision">{r.revision}</TD>
                  <TD label="Submitted by">{r.submitted_by_name ?? "Unknown"}</TD>
                  <TD className="whitespace-nowrap" label="Submitted">{formatDateTime(r.submitted_at)}</TD>
                  <TD className="text-right" action>
                    <Link href={`/portal/reports/${r.id}`} className="whitespace-nowrap text-[15px] font-bold text-link underline underline-offset-2 hover:text-link-hover">
                      View<span className="sr-only"> {r.reference_no}</span>
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
