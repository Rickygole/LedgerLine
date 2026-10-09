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

function FlagsCell({ row }: { row: ReportRow }) {
  if (row.flags.length === 0) return <span className="text-muted">None</span>;
  const labels = row.flags.map((flag) => FLAG_LABEL[flag.reason]);
  const more = labels.length - 1;
  return (
    <div className="whitespace-nowrap" title={labels.join(", ")}>
      <FlagBadge label={labels[0]} />
      {more > 0 ? (
        <span className="mt-1 block text-xs text-muted">
          +{more} more<span className="sr-only">: {labels.slice(1).join(", ")}</span>
        </span>
      ) : null}
    </div>
  );
}

export function SubmissionsTable({ rows, emptyHref }: { rows: ReportRow[]; emptyHref: string }) {
  return (
    <Table density="compact" stack>
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
            <Link href={emptyHref} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
              Clear filters
            </Link>
          </EmptyRow>
        ) : (
          rows.map((row) => (
            <TR key={row.assignmentId} className={row.bucket === "missing" ? "bg-bad-bg/40" : undefined}>
              <TD className="whitespace-nowrap" primary>
                {row.submissionId ? (
                  <Link href={`/finance/submissions/${row.submissionId}`} className="num font-mono text-[13px] font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                    {row.referenceNo}
                  </Link>
                ) : (
                  <span className="text-[13px] text-muted">Not started</span>
                )}
                {row.updatedAt ? <span className="block text-xs text-muted">Updated {formatDate(row.updatedAt)}</span> : null}
              </TD>
              <TD className="min-w-48" label="Organization">
                <div>
                  <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                    {row.orgName}
                  </Link>
                  <span className="block whitespace-nowrap text-xs text-muted">
                    <span className="num font-mono">{row.ein}</span>, {row.borough}
                  </span>
                </div>
              </TD>
              <TD className="min-w-40" stackHidden>
                <Link href={`/finance/initiatives/${row.initiativeId}`} className="text-ink hover:text-link hover:underline">
                  {row.initiativeName}
                </Link>
                <span className="block text-xs text-muted">{row.category}{row.agency ? `, ${row.agency}` : ""}</span>
              </TD>
              <TD className="min-w-28" stackHidden>
                <span title={row.sponsors.map((s) => s.name).join(", ")}>{sponsorShort(row.sponsors)}</span>
                <span className="block text-xs text-muted">{fundingLabel(row.fundingSource)}</span>
              </TD>
              <TD stackHidden>
                <ContractCell status={row.contractStatus} number={row.contractNumber} registeredOn={row.contractRegisteredOn} quiet />
              </TD>
              <TD align="right" label="Award">{formatCurrency(row.award, { cents: false })}</TD>
              <TD className="whitespace-nowrap" label="State">
                <div>
                  <StateBadge state={reportState(row.status, row.dueOn)} />
                  <span className="mt-1 block text-xs">{dueCell(row)}</span>
                </div>
              </TD>
              <TD label="Flags">
                <FlagsCell row={row} />
              </TD>
            </TR>
          ))
        )}
      </tbody>
    </Table>
  );
}

