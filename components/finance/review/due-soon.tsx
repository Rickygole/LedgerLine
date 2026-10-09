import Link from "next/link";
import { DueBadge } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCurrency } from "@/lib/rules/money";
import type { ReportRow } from "@/lib/finance/review/types";

export function DueSoonList({ rows }: { rows: ReportRow[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Organization</TH>
          <TH>Initiative</TH>
          <TH align="right">Award</TH>
          <TH>Timing</TH>
        </tr>
      </THead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={4}>Nothing is waiting on an organization for this period.</EmptyRow>
        ) : (
          rows.map((row) => (
            <TR key={row.assignmentId}>
              <TD>
                <Link href={`/finance/organizations/${row.orgId}`} className="font-medium text-navy-700 hover:underline">
                  {row.orgName}
                </Link>
              </TD>
              <TD>
                <Link href={`/finance/initiatives/${row.initiativeId}`} className="text-ink hover:underline">
                  {row.initiativeName}
                </Link>
              </TD>
              <TD align="right">{formatCurrency(row.award)}</TD>
              <TD>
                <DueBadge daysPastDue={row.daysPastDue} />
                {row.daysPastDue <= -14 ? <span className="text-muted">Due in {Math.abs(row.daysPastDue)} days</span> : null}
              </TD>
            </TR>
          ))
        )}
      </tbody>
    </Table>
  );
}
