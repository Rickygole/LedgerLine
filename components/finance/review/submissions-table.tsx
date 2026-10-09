import Link from "next/link";
import { DueBadge, FlagBadge, StateBadge } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { reportState } from "@/lib/reporting";
import { formatCurrency } from "@/lib/rules/money";
import { FLAG_LABEL } from "@/lib/finance/review/filters";
import type { ReportRow } from "@/lib/finance/review/types";

function dueCell(row: ReportRow) {
  if (row.status === null || row.status === "draft" || row.status === "returned") {
    return row.daysPastDue > -14 ? <DueBadge daysPastDue={row.daysPastDue} /> : <span className="text-muted">Due in {Math.abs(row.daysPastDue)} days</span>;
  }
  if (row.submittedAt && row.daysPastDue > 0) {
    const late = Math.round((Date.parse(row.submittedAt) - Date.parse(`${row.dueOn}T23:59:59-04:00`)) / 86_400_000);
    if (late > 0) return <span className="text-muted">Submitted {late} {late === 1 ? "day" : "days"} late</span>;
  }
  return <span className="text-muted">On time</span>;
}

export function SubmissionsTable({ rows, emptyHref }: { rows: ReportRow[]; emptyHref: string }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Reference</TH>
          <TH>Organization</TH>
          <TH>EIN</TH>
          <TH>Initiative</TH>
          <TH>Borough</TH>
          <TH align="right">Award</TH>
          <TH>State</TH>
          <TH>Timing</TH>
          <TH>Flags</TH>
          <TH>Last activity</TH>
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={10}>
            No reports match these filters.{" "}
            <Link href={emptyHref} className="font-semibold text-navy-700 hover:underline">
              Clear filters
            </Link>
          </EmptyRow>
        ) : (
          rows.map((row) => (
            <TR key={row.assignmentId}>
              <TD className="whitespace-nowrap">
                {row.submissionId ? (
                  <Link href={`/finance/submissions/${row.submissionId}`} className="num font-semibold text-navy-700 hover:underline">
                    {row.referenceNo}
                  </Link>
                ) : (
                  <span className="text-muted">Not started</span>
                )}
              </TD>
              <TD className="min-w-48">
                <Link href={`/finance/organizations/${row.orgId}`} className="font-medium text-ink hover:text-navy-700 hover:underline">
                  {row.orgName}
                </Link>
              </TD>
              <TD className="num whitespace-nowrap">{row.ein}</TD>
              <TD className="min-w-48">
                <Link href={`/finance/initiatives/${row.initiativeId}`} className="text-ink hover:text-navy-700 hover:underline">
                  {row.initiativeName}
                </Link>
                <span className="block text-xs text-muted">{row.category}</span>
              </TD>
              <TD>{row.borough}</TD>
              <TD align="right">{formatCurrency(row.award)}</TD>
              <TD>
                <StateBadge state={reportState(row.status, row.dueOn)} />
              </TD>
              <TD className="whitespace-nowrap">{dueCell(row)}</TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {row.flags.length === 0 ? <span className="text-muted">None</span> : row.flags.map((flag) => <FlagBadge key={flag.reason} label={FLAG_LABEL[flag.reason]} />)}
                </div>
              </TD>
              <TD className="whitespace-nowrap text-muted">{row.updatedAt ? formatDateTime(row.updatedAt) : "No activity"}</TD>
            </TR>
          ))
        )}
      </tbody>
    </Table>
  );
}

