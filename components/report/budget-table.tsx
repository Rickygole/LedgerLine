import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { lineVariance, spendSummary, VARIANCE_NOTE_KEY } from "@/lib/rules/spend";
import { budgetTotals } from "@/lib/rules/validate";
import type { Answers, BudgetLine } from "@/lib/rules/types";
import { NoValue } from "./no-value";
import { balanceCopy } from "./balance";

type Line = Omit<BudgetLine, "rowId">;

export function BudgetTable({
  lines,
  award,
  answers,
  totalLabel = "Approved budget total",
}: {
  lines: Line[];
  award: number;
  answers: Answers;
  totalLabel?: string;
}) {
  const withIds: BudgetLine[] = lines.map((line) => ({ ...line, rowId: String(line.position) }));
  const totals = budgetTotals(withIds);
  const balance = balanceCopy(totals.total, award);
  const spend = spendSummary(withIds, award);
  const note = answers[VARIANCE_NOTE_KEY];
  const span = 3;

  const columns = spend.entered ? 6 : 4;
  const money = (value: number) => formatCurrency(value, { cents: true });
  const balanceText =
    balance.tone === "ok"
      ? `Budget balanced: total equals the ${formatCurrency(award, { cents: "auto" })} award.`
      : balance.text;
  const footRow = "text-[15px] leading-[22px]";

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="overflow-hidden rounded-md border border-line">
          <Table stack>
            <THead>
              <tr>
                <TH align="right">Line</TH>
                <TH>Category</TH>
                <TH>Description</TH>
                <TH align="right">Approved budget</TH>
                {spend.entered ? <TH align="right">Actual spent</TH> : null}
                {spend.entered ? <TH align="right">Variance</TH> : null}
              </tr>
            </THead>
            <tbody>
              {lines.length === 0 ? <EmptyRow colSpan={columns}>No budget lines.</EmptyRow> : null}
              {withIds.map((line) => {
                const variance = lineVariance(line);
                return (
                  <TR key={line.position}>
                    <TD align="right" className="num" stackHidden>
                      {line.position}
                    </TD>
                    <TD className="whitespace-nowrap" primary>
                      <span className="md:hidden">Line {line.position}: </span>
                      {line.category}
                    </TD>
                    <TD>{line.description || <span className="text-muted">No description</span>}</TD>
                    <TD align="right" label="Approved budget">
                      <span>{money(line.amount)}</span>
                    </TD>
                    {spend.entered ? (
                      <TD align="right" label="Actual spent">
                        {line.actual === null || line.actual === undefined ? (
                          <NoValue />
                        ) : (
                          <span>{money(line.actual)}</span>
                        )}
                      </TD>
                    ) : null}
                    {spend.entered ? (
                      <TD
                        align="right"
                        label="Variance"
                        className={cn(variance !== null && variance < 0 && "font-semibold text-warn")}
                      >
                        {variance === null ? <NoValue /> : <span>{money(variance)}</span>}
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </tbody>
            <tfoot className="border-t border-line bg-surface/60">
              <tr className={footRow}>
                <td colSpan={span} className="px-4 py-2 text-right text-ink-2">
                  Personal services (PS) subtotal
                </td>
                <td className="num px-4 py-2 text-right text-ink">{money(totals.ps)}</td>
                {spend.entered ? <td colSpan={2} /> : null}
              </tr>
              <tr className={footRow}>
                <td colSpan={span} className="px-4 py-2 text-right text-ink-2">
                  Other than personal services (OTPS) subtotal
                </td>
                <td className="num px-4 py-2 text-right text-ink">{money(totals.otps)}</td>
                {spend.entered ? <td colSpan={2} /> : null}
              </tr>
              <tr className={cn(footRow, "font-semibold text-ink")}>
                <td colSpan={span} className="px-4 py-2 text-right">
                  {totalLabel}
                </td>
                <td className="num px-4 py-2 text-right">{money(totals.total)}</td>
                {spend.entered ? <td className="num px-4 py-2 text-right">{money(spend.actual)}</td> : null}
                {spend.entered ? <td className="num px-4 py-2 text-right">{money(spend.variance)}</td> : null}
              </tr>
              <tr className={footRow}>
                <td colSpan={span} className="px-4 py-2 text-right text-ink-2">
                  Award
                </td>
                <td className="num px-4 py-2 text-right text-ink">{money(award)}</td>
                {spend.entered ? <td colSpan={2} /> : null}
              </tr>
              {spend.entered ? (
                <tr className={footRow}>
                  <td colSpan={span} className="px-4 py-2 text-right text-ink-2">
                    Unspent balance (award minus actual spent)
                  </td>
                  <td colSpan={3} className="num px-4 py-2 text-right text-ink">
                    {money(spend.unspent)} ({spend.unspentPercent.toFixed(1)}% of the award)
                  </td>
                </tr>
              ) : null}
            </tfoot>
          </Table>
        </div>
        {lines.length > 0 && !spend.entered ? (
          <p className="text-sm text-muted">Actual spending was not reported with this revision.</p>
        ) : null}
      </div>
      {lines.length > 0 ? <p className="num text-sm font-semibold text-ink">{balanceText}</p> : null}
      {typeof note === "string" && note.trim() !== "" ? (
        <div className="max-w-3xl">
          <p className="text-[13px] font-semibold text-muted">Variance explanation</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{note.trim()}</p>
        </div>
      ) : null}
    </div>
  );
}
