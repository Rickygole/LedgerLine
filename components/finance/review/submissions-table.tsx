import Link from "next/link";
import { FlagBadge, StateBadge } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { reportState } from "@/lib/reporting";
import { formatCurrency } from "@/lib/rules/money";
import { FLAG_LABEL } from "@/lib/finance/review/filters";
import { fundingLabel, sponsorShort } from "@/lib/finance/awards";
import { ContractCell } from "@/components/finance/admin/award-cells";
import type { ReportRow } from "@/lib/finance/review/types";

function dueCell(row: ReportRow) {
  if (row.status === null || row.status === "draft" || row.status === "returned") {
    const days = Math.abs(row.daysPastDue);
    const unit = days === 1 ? "day" : "days";
    if (row.daysPastDue > 0) return <span className="font-semibold text-bad">{days} {unit} past due</span>;
    if (row.daysPastDue === 0) return <span className="font-semibold text-warn">Due today</span>;
    return <span className={row.daysPastDue > -14 ? "font-semibold text-warn" : "text-muted"}>Due in {days} {unit}</span>;
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
          <TH>Initiative</TH>
          <TH>Council Member</TH>
          <TH>Contract</TH>
          <TH align="right">Award</TH>
          <TH>State</TH>
          <TH>Flags</TH>
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={8}>
            No reports match these filters.{" "}
            <Link href={emptyHref} className="font-semibold text-navy-700 hover:underline">
              Clear filters
            </Link>
          </EmptyRow>
        ) : (
          rows.map((row) => (
            <TR key={row.assignmentId} className={row.bucket === "missing" ? "bg-bad-bg/40" : undefined}>
              <TD className="whitespace-nowrap">
                {row.submissionId ? (
                  <Link href={`/finance/submissions/${row.submissionId}`} className="num font-mono text-[13px] font-semibold text-navy-700 hover:underline">
                    {row.referenceNo}
                  </Link>
                ) : (
                  <span className="text-[13px] text-muted">Not started</span>
                )}
                {row.updatedAt ? <span className="block text-xs text-muted">Updated {formatDate(row.updatedAt)}</span> : null}
              </TD>
              <TD className="min-w-48">
                <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-navy-700 hover:underline">
                  {row.orgName}
                </Link>
                <span className="num block whitespace-nowrap font-mono text-xs text-muted">{row.ein}</span>
                <span className="block text-xs text-muted">{row.borough}</span>
              </TD>
              <TD className="min-w-40">
                <Link href={`/finance/initiatives/${row.initiativeId}`} className="text-ink hover:text-navy-700 hover:underline">
                  {row.initiativeName}
                </Link>
                <span className="block text-xs text-muted">{row.category}{row.agency ? `, ${row.agency}` : ""}</span>
              </TD>
              <TD className="min-w-28">
                <span title={row.sponsors.map((s) => s.name).join(", ")}>{sponsorShort(row.sponsors)}</span>
                <span className="block text-xs text-muted">{fundingLabel(row.fundingSource)}</span>
              </TD>
              <TD>
                <ContractCell status={row.contractStatus} number={row.contractNumber} registeredOn={row.contractRegisteredOn} />
              </TD>
              <TD align="right">{formatCurrency(row.award)}</TD>
              <TD className="whitespace-nowrap">
                <StateBadge state={reportState(row.status, row.dueOn)} />
                <span className="mt-1 block text-xs">{dueCell(row)}</span>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {row.flags.length === 0 ? <span className="text-muted">None</span> : row.flags.map((flag) => <FlagBadge key={flag.reason} label={FLAG_LABEL[flag.reason]} />)}
                </div>
              </TD>
            </TR>
          ))
        )}
      </tbody>
    </Table>
  );
}

