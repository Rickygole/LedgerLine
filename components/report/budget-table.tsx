import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { lineVariance, spendSummary, VARIANCE_NOTE_KEY } from "@/lib/rules/spend";
import { budgetTotals } from "@/lib/rules/validate";
import type { Answers, BudgetLine } from "@/lib/rules/types";
import { balanceCopy } from "./balance";

type Line = Omit<BudgetLine, "rowId">;

export function BudgetTable({ lines, award, answers, totalLabel = "Approved budget total" }: { lines: Line[]; award: number; answers: Answers; totalLabel?: string }) {
  const withIds: BudgetLine[] = lines.map((line) => ({ ...line, rowId: String(line.position) }));
  const totals = budgetTotals(withIds);
  const balance = balanceCopy(totals.total, award);
  const spend = spendSummary(withIds, award);
  const note = answers[VARIANCE_NOTE_KEY];
  const span = 3;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-md border border-line">
        <Table>
          <THead>
            <tr>
              <TH align="right">Line</TH>
              <TH>Category</TH>
              <TH>Description</TH>
              <TH align="right">Approved budget</TH>
              <TH align="right">Actual spent</TH>
              <TH align="right">Variance</TH>
            </tr>
          </THead>
          <tbody>
            {lines.length === 0 ? <EmptyRow colSpan={6}>No budget lines.</EmptyRow> : null}
            {withIds.map((line) => {
              const variance = lineVariance(line);
              return (
                <TR key={line.position}>
                  <TD align="right" className="num">{line.position}</TD>
                  <TD className="whitespace-nowrap">{line.category}</TD>
                  <TD>{line.description || <span className="text-muted">No description</span>}</TD>
                  <TD align="right">{formatCurrency(line.amount)}</TD>
                  <TD align="right">{line.actual === null || line.actual === undefined ? <span className="text-muted">Not entered</span> : formatCurrency(line.actual)}</TD>
                  <TD align="right" className={cn(variance !== null && variance < 0 && "font-semibold text-warn")}>
                    {variance === null ? <span className="text-muted">Not entered</span> : formatCurrency(variance)}
                  </TD>
                </TR>
              );
            })}
          </tbody>
          <tfoot className="border-t border-line bg-surface/60 text-sm">
            <tr>
              <td colSpan={span} className="px-4 py-2 text-right font-semibold">Personal services (PS) subtotal</td>
              <td className="num px-4 py-2 text-right">{formatCurrency(totals.ps)}</td>
              <td colSpan={2} />
            </tr>
            <tr>
              <td colSpan={span} className="px-4 py-2 text-right font-semibold">Other than personal services (OTPS) subtotal</td>
              <td className="num px-4 py-2 text-right">{formatCurrency(totals.otps)}</td>
              <td colSpan={2} />
            </tr>
            <tr>
              <td colSpan={span} className="px-4 py-2 text-right font-semibold">{totalLabel}</td>
              <td className="num px-4 py-2 text-right font-bold">{formatCurrency(totals.total)}</td>
              <td className="num px-4 py-2 text-right font-bold">{spend.entered ? formatCurrency(spend.actual) : ""}</td>
              <td className="num px-4 py-2 text-right font-bold">{spend.entered ? formatCurrency(spend.variance) : ""}</td>
            </tr>
            <tr>
              <td colSpan={span} className="px-4 py-2 text-right font-semibold">Award</td>
              <td className="num px-4 py-2 text-right">{formatCurrency(award)}</td>
              <td colSpan={2} />
            </tr>
            {spend.entered ? (
              <tr>
                <td colSpan={span} className="px-4 py-2 text-right font-semibold">Unspent balance (award minus actual spent)</td>
                <td colSpan={3} className="num px-4 py-2 text-right">
                  {formatCurrency(spend.unspent)} ({spend.unspentPercent.toFixed(1)}% of the award)
                </td>
              </tr>
            ) : null}
          </tfoot>
        </Table>
      </div>
      {lines.length > 0 ? <p className="num text-sm font-semibold text-ink">{balance.text}</p> : null}
      {typeof note === "string" && note.trim() !== "" ? (
        <div className="max-w-3xl">
          <p className="text-[13px] font-semibold text-muted">Variance explanation</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{note.trim()}</p>
        </div>
      ) : null}
    </div>
  );
}
