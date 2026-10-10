import Link from "next/link";
import { FlagBadge, StateBadge } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { reportState } from "@/lib/reporting";
import { formatCurrency } from "@/lib/rules/money";
import { FLAG_LABEL } from "@/lib/finance/review/filters";
import { sponsorLabel, sponsorNames } from "@/lib/finance/awards";
import type { ReportRow } from "@/lib/finance/review/types";

export function dueCell(row: Pick<ReportRow, "status" | "daysPastDue" | "submittedAt" | "dueOn">) {
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
        <span className="ml-1 text-[13px] text-muted">
          +{more}
          <span className="sr-only"> more: {labels.slice(1).join(", ")}</span>
        </span>
      ) : null}
    </div>
  );
}

export function orgMeta(row: Pick<ReportRow, "ein" | "borough" | "councilDistrict">) {
  return [row.ein, row.borough, row.councilDistrict ? `District ${row.councilDistrict}` : null].filter(Boolean).join(" · ");
}

export function SubmissionsTable({ rows, emptyHref }: { rows: ReportRow[]; emptyHref: string }) {
  return (
    <Table density="compact" stack className="@container [&_td]:text-[15px]">
      <THead>
        <tr>
          <TH>Organization</TH>
          <TH>Initiative</TH>
          <TH className="@max-[64rem]:hidden">Sponsor</TH>
          <TH align="right">Award</TH>
          <TH>Status</TH>
          <TH>Flags</TH>
          <TH>Reference</TH>
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={7}>
            No reports match these filters.{" "}
            <Link href={emptyHref} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
              Clear all filters
            </Link>
          </EmptyRow>
        ) : (
          rows.map((row) => (
            <TR key={row.assignmentId} className="lg:h-14">
              <TD className="min-w-48" primary>
                <div>
                  <Link href={row.submissionId ? `/finance/submissions/${row.submissionId}` : `/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                    {row.orgName}
                    {row.submissionId ? null : <span className="sr-only">, not started, open organization</span>}
                  </Link>
                  <span className="num block text-[13px] text-muted">{orgMeta(row)}</span>
                </div>
              </TD>
              <TD className="min-w-40" label="Initiative">
                <div>
                  <span className="text-ink">{row.initiativeName}</span>
                  <span className="block text-[13px] text-muted">{[row.initiativeCode, row.category, row.agency].filter(Boolean).join(" · ")}</span>
                  <span className="hidden text-[13px] text-muted @max-[64rem]:block">{sponsorLabel(row)}</span>
                </div>
              </TD>
              <TD className="min-w-32 @max-[64rem]:hidden" stackHidden>
                <span title={row.sponsors.length > 1 ? sponsorNames(row.sponsors) : undefined}>{sponsorLabel(row)}</span>
              </TD>
              <TD align="right" label="Award">{formatCurrency(row.award, { cents: false })}</TD>
              <TD className="min-w-36" label="Status">
                <div>
                  <StateBadge state={reportState(row.status, row.dueOn)} />
                  <span className="mt-1 block text-[13px]">{dueCell(row)}</span>
                </div>
              </TD>
              <TD label="Flags">
                <FlagsCell row={row} />
              </TD>
              <TD label="Reference">
                <span className="whitespace-nowrap font-mono text-sm text-muted">{row.referenceNo ?? "Not started"}</span>
              </TD>
            </TR>
          ))
        )}
      </tbody>
    </Table>
  );
}
