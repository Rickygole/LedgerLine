"use client";

import { AlertTriangle, CheckCircle2, ClipboardPaste, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  amountTextMessage,
  emptyRow,
  formatAmountText,
  isBlankRow,
  linesFromRows,
  newRowId,
  type BudgetRow,
} from "@/lib/report/budget-rows";
import { parseAmount } from "@/lib/rules/money";
import { formatCurrency, plural } from "@/lib/format";
import { balanceCopy, minusCurrency, signedDifference } from "./balance";
import { BalanceMeter } from "./balance-meter";
import { parseBudgetPaste } from "@/lib/rules/paste";
import {
  lineVariance,
  needsVarianceNote,
  spendSummary,
  VARIANCE_NOTE_MAX,
  VARIANCE_THRESHOLD_PERCENT,
} from "@/lib/rules/spend";
import { budgetTotals } from "@/lib/rules/validate";

const COLS =
  "@min-[720px]:grid @min-[720px]:grid-cols-[2.5rem_6.5rem_minmax(0,1fr)_8.5rem_7.5rem_7rem_2.5rem] @min-[720px]:items-stretch";

const cell =
  "block h-10 @min-[720px]:h-full w-full rounded-md border border-line bg-white px-3 text-base text-ink sm:text-sm placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-harbor-600 @min-[720px]:rounded-none @min-[720px]:border-0 @min-[720px]:bg-transparent @min-[720px]:hover:bg-harbor-50/50 aria-[invalid=true]:border-bad aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-inset aria-[invalid=true]:ring-bad/60";

type Toast = { tone: "ok" | "warn"; text: string };

export function BudgetGrid({
  rows,
  onChange,
  award,
  maxLines,
  rowErrors,
  gridError,
  varianceNote,
  onVarianceNote,
  varianceError,
}: {
  rows: BudgetRow[];
  onChange: (rows: BudgetRow[]) => void;
  award: number;
  maxLines: number;
  rowErrors: Record<string, string>;
  gridError?: string;
  varianceNote: string;
  onVarianceNote: (value: string) => void;
  varianceError?: string;
}) {
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const [note, setNote] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const focusRow = useRef<string | null>(null);
  const focusAdd = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const lines = useMemo(() => linesFromRows(rows), [rows]);
  const totals = useMemo(() => budgetTotals(lines), [lines]);
  const spend = useMemo(() => spendSummary(lines, award), [lines, award]);
  const explainVariance = useMemo(() => needsVarianceNote(lines, award), [lines, award]);
  const balance = balanceCopy(totals.total, award);
  const atLimit = rows.length >= maxLines;

  useEffect(() => {
    if (focusRow.current) {
      document.getElementById(`budget-desc-${focusRow.current}`)?.focus();
      focusRow.current = null;
    }
    if (focusAdd.current) {
      addButton.current?.focus();
      focusAdd.current = false;
    }
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function update(rowId: string, patch: Partial<BudgetRow>) {
    onChange(rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  }

  function addRow() {
    if (atLimit) return;
    const row = emptyRow(rows[rows.length - 1]?.category ?? "PS");
    focusRow.current = row.rowId;
    onChange([...rows, row]);
  }

  function removeRow(rowId: string, n: number) {
    onChange(rows.filter((row) => row.rowId !== rowId));
    setNote(`Line ${n} removed.`);
    focusAdd.current = true;
  }

  function applyPaste(text: string): boolean {
    const result = parseBudgetPaste(text);
    const base = rows.filter((row) => !isBlankRow(row));
    const room = Math.max(0, maxLines - base.length);
    const accepted = result.rows.slice(0, room);
    const trimmed = result.rows.length - accepted.length;
    const added = accepted.map((row) => ({
      rowId: newRowId(),
      category: row.category,
      description: row.description,
      amountText: formatAmountText(row.amount),
      actualText: "",
    }));
    const skipped = result.skipped.length + trimmed;

    if (added.length === 0) {
      setToast({
        tone: "warn",
        text: "No rows were added. Copy rows from Excel with category, description and amount columns, then paste again.",
      });
      return false;
    }

    const reasons = [
      ...result.skipped.map((item) => `row ${item.line}: ${item.reason.toLowerCase()}`),
      ...(trimmed > 0 ? [`${trimmed} over the ${maxLines} line limit`] : []),
    ];
    const summary = `${added.length} ${plural(added.length, "row", "rows")} added${skipped > 0 ? `, ${skipped} skipped (${reasons.join("; ")})` : ""}`;
    setToast({ tone: skipped > 0 ? "warn" : "ok", text: summary });

    onChange([...base, ...added]);
    setHighlight(new Set(added.map((row) => row.rowId)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlight(new Set()), 2600);
    return true;
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData("text");
    const trimmed = text.trim();
    if (event.target instanceof HTMLTextAreaElement) return;
    if (event.target instanceof HTMLInputElement && !(trimmed.includes("\t") && trimmed.includes("\n"))) return;
    if (!/[\t\n]/.test(trimmed)) return;
    event.preventDefault();
    applyPaste(text);
  }

  const toolbar = (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setPasteOpen((open) => !open)}
        aria-expanded={pasteOpen}
        aria-controls="budget-paste-panel"
      >
        <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
        Paste from Excel
      </Button>
      <Button ref={addButton} variant="secondary" size="sm" onClick={addRow} disabled={atLimit}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add line
      </Button>
    </>
  );

  return (
    <div id="budget-grid" tabIndex={-1} onPaste={onPaste} className="@container focus:outline-none">
      <div className="sticky top-0 z-20 -mx-1 bg-white px-1 pb-4 pt-1">
        <BalanceMeter total={totals.total} award={award} lines={lines.length} />
      </div>

      {rows.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {toolbar}
            <span className="num ml-auto text-sm font-medium text-muted">
              {rows.length} of {maxLines} lines
            </span>
          </div>
          <details className="mb-4 text-sm leading-5">
            <summary className="cursor-pointer font-semibold text-link underline underline-offset-2 hover:text-link-hover">
              What PS and OTPS mean
            </summary>
            <p className="mt-2 max-w-[70ch] text-ink-2">
              PS is personal services: salaries and fringe. OTPS is other than personal services: supplies, rent and
              contracts.
            </p>
          </details>
        </>
      ) : null}

      {pasteOpen ? (
        <div id="budget-paste-panel" className="mb-4 rounded border border-line bg-harbor-50 px-4 py-4">
          <label htmlFor="budget-paste-text" className="mb-1 block text-sm font-semibold text-ink">
            Paste your rows here
          </label>
          <p className="mb-2 text-sm text-muted">
            Copy the rows in Excel with three columns: category, description and amount.
          </p>
          <Textarea
            id="budget-paste-text"
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={5}
            className="font-mono text-base sm:text-sm"
          />
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (applyPaste(pasteText)) {
                  setPasteText("");
                  setPasteOpen(false);
                }
              }}
              disabled={pasteText.trim() === ""}
            >
              Add pasted rows
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div role="status" aria-live="polite">
        {toast ? (
          <div
            className={cn(
              "mb-3 flex items-start justify-between gap-3 rounded border px-3 py-2.5 text-sm sm:px-4",
              toast.tone === "ok" ? "border-ok/30 bg-ok-bg text-ok" : "border-warn/30 bg-warn-bg text-warn",
            )}
          >
            <p className="flex items-start gap-2 font-semibold">
              {toast.tone === "ok" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span className="num">{toast.text}</span>
            </p>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="-m-1 rounded p-1 hover:bg-black/5"
              aria-label="Dismiss paste summary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <span className="sr-only">{note}</span>
      </div>

      {gridError ? <p className="mb-3 text-sm font-semibold text-bad">{gridError}</p> : null}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="text-[17px] font-bold leading-6 text-ink">No budget lines yet</p>
          <p className="max-w-[46ch] text-[15px] leading-[22px] text-ink-2">
            Paste rows from Excel (Category, Description, Amount) or add lines one at a time.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-3">{toolbar}</div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto lg:-mx-6">
            <div className="@container lg:min-w-[720px]">
              <div className="@min-[720px]:rounded @min-[720px]:border @min-[720px]:border-line lg:rounded-none lg:border-x-0">
                <div
                  className={cn(
                    "hidden h-11 border-b border-line bg-harbor-50 text-[13px] font-semibold text-ink-2",
                    COLS,
                    "@min-[720px]:items-center",
                  )}
                >
                  <span className="px-3 text-right">#</span>
                  <span className="px-3">Category</span>
                  <span className="px-3">Description</span>
                  <span className="px-3 text-right">Approved budget</span>
                  <span className="px-3 text-right">Actual spent</span>
                  <span className="px-3 text-right">Variance</span>
                  <span className="sr-only">Actions</span>
                </div>

                <ul>
                  {rows.map((row, index) => {
                    const n = index + 1;
                    const error = rowErrors[row.rowId];
                    const amountMessage = amountTextMessage(row.amountText, `Line ${index + 1}: the amount`);
                    const actualMessage = amountTextMessage(row.actualText, `Line ${index + 1}: actual spent`);
                    const badAmount = amountMessage !== null;
                    const badActual = actualMessage !== null;
                    const variance = lineVariance(lines[index]);
                    const errorId = `budget-row-error-${row.rowId}`;
                    const message = error ?? amountMessage ?? actualMessage;
                    return (
                      <li
                        key={row.rowId}
                        className={cn(
                          "transition-colors hover:bg-harbor-50/60 @max-[719px]:mb-3 @max-[719px]:grid @max-[719px]:grid-cols-[6.5rem_minmax(0,1fr)] @max-[719px]:gap-3 @max-[719px]:rounded-md @max-[719px]:border @max-[719px]:border-line @max-[719px]:p-3 @min-[720px]:min-h-[52px] @min-[720px]:border-b @min-[720px]:border-line-soft",
                          COLS,
                          highlight.has(row.rowId) && "bg-info-bg",
                        )}
                      >
                        <p className="num flex items-center justify-between text-sm font-semibold text-muted @max-[719px]:col-span-2 @min-[720px]:justify-end @min-[720px]:border-r @min-[720px]:border-line @min-[720px]:px-3">
                          <span>
                            <span className="@min-[720px]:sr-only">Line </span>
                            {n}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRow(row.rowId, n)}
                            aria-label={`Remove line ${n}`}
                            className="@min-[720px]:hidden"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Remove
                          </Button>
                        </p>
                        <div className="@min-[720px]:border-r @min-[720px]:border-line">
                          <label
                            htmlFor={`budget-cat-${row.rowId}`}
                            className="mb-1 block text-xs font-semibold text-muted @min-[720px]:sr-only"
                          >
                            <span className="sr-only">Line {n} </span>
                            Category
                          </label>
                          <select
                            id={`budget-cat-${row.rowId}`}
                            value={row.category}
                            onChange={(event) => update(row.rowId, { category: event.target.value as "PS" | "OTPS" })}
                            className={cn(cell, "pr-8")}
                          >
                            <option value="PS" title="Personal services">
                              PS
                            </option>
                            <option value="OTPS" title="Other than personal services">
                              OTPS
                            </option>
                          </select>
                        </div>
                        <div className="@max-[719px]:order-last @max-[719px]:col-span-2 @min-[720px]:border-r @min-[720px]:border-line">
                          <label
                            htmlFor={`budget-desc-${row.rowId}`}
                            className="mb-1 block text-xs font-semibold text-muted @min-[720px]:sr-only"
                          >
                            <span className="sr-only">Line {n} </span>
                            Description
                          </label>
                          <input
                            id={`budget-desc-${row.rowId}`}
                            value={row.description}
                            aria-invalid={error && !badAmount ? true : undefined}
                            aria-describedby={error ? errorId : undefined}
                            onChange={(event) => update(row.rowId, { description: event.target.value })}
                            maxLength={500}
                            placeholder="What the money paid for"
                            className={cell}
                          />
                        </div>
                        <div className="@min-[720px]:border-r @min-[720px]:border-line">
                          <label
                            htmlFor={`budget-amt-${row.rowId}`}
                            className="mb-1 block text-xs font-semibold text-muted @min-[720px]:sr-only"
                          >
                            <span className="sr-only">Line {n} </span>
                            Approved budget
                          </label>
                          <div className="relative @min-[720px]:h-full">
                            <span
                              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted"
                              aria-hidden="true"
                            >
                              $
                            </span>
                            <input
                              id={`budget-amt-${row.rowId}`}
                              inputMode="decimal"
                              value={row.amountText}
                              aria-invalid={badAmount || undefined}
                              aria-describedby={badAmount || error ? errorId : undefined}
                              onChange={(event) => update(row.rowId, { amountText: event.target.value })}
                              onBlur={() => {
                                const parsed = parseAmount(row.amountText);
                                if (parsed !== null) update(row.rowId, { amountText: formatAmountText(parsed) });
                              }}
                              placeholder="0.00"
                              className={cn(cell, "num pl-7 text-right")}
                            />
                          </div>
                        </div>
                        <div className="@min-[720px]:border-r @min-[720px]:border-line">
                          <label
                            htmlFor={`budget-act-${row.rowId}`}
                            className="mb-1 block text-xs font-semibold text-muted @min-[720px]:sr-only"
                          >
                            <span className="sr-only">Line {n} </span>
                            Actual spent
                          </label>
                          <div className="relative @min-[720px]:h-full">
                            <span
                              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted"
                              aria-hidden="true"
                            >
                              $
                            </span>
                            <input
                              id={`budget-act-${row.rowId}`}
                              inputMode="decimal"
                              value={row.actualText}
                              aria-invalid={badActual || undefined}
                              aria-describedby={badActual || error ? errorId : undefined}
                              onChange={(event) => update(row.rowId, { actualText: event.target.value })}
                              onBlur={() => {
                                const parsed = parseAmount(row.actualText);
                                if (parsed !== null) update(row.rowId, { actualText: formatAmountText(parsed) });
                              }}
                              placeholder="0.00"
                              className={cn(cell, "num pl-7 text-right")}
                            />
                          </div>
                        </div>
                        <div className="num flex items-center justify-between px-3 text-sm @min-[720px]:justify-end @min-[720px]:border-r @min-[720px]:border-line @max-[719px]:col-span-2">
                          <span className="text-xs font-semibold text-muted @min-[720px]:sr-only">Variance</span>
                          <span
                            className={cn(
                              variance === null ? "text-muted" : variance < 0 ? "font-semibold text-bad" : "text-ink",
                            )}
                          >
                            {variance === null ? "Not entered" : minusCurrency(variance)}
                          </span>
                        </div>
                        <div className="hidden items-center justify-center @min-[720px]:flex">
                          <button
                            type="button"
                            onClick={() => removeRow(row.rowId, n)}
                            aria-label={`Remove line ${n}`}
                            className="rounded-md p-2 text-muted hover:bg-bad-bg hover:text-bad"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                        {message ? (
                          <p
                            id={errorId}
                            className="text-sm font-semibold text-bad @max-[719px]:order-last @max-[719px]:col-span-2 @min-[720px]:col-span-7 @min-[720px]:border-t @min-[720px]:border-line @min-[720px]:bg-bad-bg/40 @min-[720px]:px-3 @min-[720px]:py-1.5 @min-[720px]:pl-[3.75rem]"
                          >
                            {message}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded border border-line lg:-mx-6 lg:rounded-none lg:border-x-0 lg:border-b-0">
            <div className="bg-harbor-50/50 text-[15px] leading-[22px]">
              <dl>
                {[
                  ["Personal services (PS) subtotal", totals.ps],
                  ["Other than personal services (OTPS) subtotal", totals.otps],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-3 py-2 sm:px-4 lg:px-6">
                    <dt className="text-muted">{label}</dt>
                    <dd className="num text-ink">{formatCurrency(value as number)}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 border-t border-line px-3 py-2.5 sm:px-4 lg:px-6">
                  <dt className="font-semibold text-ink">Approved budget total</dt>
                  <dd className="num font-bold text-ink">{formatCurrency(totals.total)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-3 pb-2.5 sm:px-4 lg:px-6">
                  <dt className="text-muted">Award</dt>
                  <dd className="num text-muted">{formatCurrency(award)}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-3 pb-2.5 sm:px-4 lg:px-6">
                  <dt className="font-semibold text-ink">Difference (budget total minus award)</dt>
                  <dd
                    className={cn(
                      "num font-bold",
                      balance.tone === "ok" ? "text-ok" : balance.tone === "warn" ? "text-warn" : "text-bad",
                    )}
                  >
                    {signedDifference(totals.total, award)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-line px-3 py-2.5 sm:px-4 lg:px-6">
                  <dt className="font-semibold text-ink">Actual spent total</dt>
                  <dd className="num font-bold text-ink">
                    {spend.entered ? formatCurrency(spend.actual) : "Not entered"}
                  </dd>
                </div>
                {spend.entered ? (
                  <>
                    <div className="flex items-center justify-between gap-4 px-3 py-2 sm:px-4 lg:px-6">
                      <dt className="text-muted">Variance (approved budget minus actual spent)</dt>
                      <dd className="num text-ink">{formatCurrency(spend.variance)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 px-3 pb-2.5 sm:px-4 lg:px-6">
                      <dt className="text-muted">Unspent balance (award minus actual spent)</dt>
                      <dd className={cn("num font-semibold", explainVariance ? "text-warn" : "text-ink")}>
                        {formatCurrency(spend.unspent)}{" "}
                        <span className="font-normal text-muted">
                          ({spend.unspentPercent.toFixed(1)}% of the award)
                        </span>
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
              {spend.entered ? null : (
                <p className="px-3 pb-2.5 text-muted sm:px-4 lg:px-6">
                  Enter what was actually spent on each line to see the variance and the unspent balance. Actual spent
                  does not have to equal the approved budget.
                </p>
              )}
            </div>

            {explainVariance ? (
              <div className="rounded-b border-t border-line px-3 py-4 sm:px-4 lg:px-6">
                <label htmlFor="budget-variance-note" className="block text-sm font-semibold text-ink">
                  Variance explanation
                </label>
                <p id="budget-variance-hint" className="mt-1 text-sm text-muted">
                  More than {VARIANCE_THRESHOLD_PERCENT}% of the award is unspent. Say briefly why, for example a
                  vacancy, a late start or a vendor delay.
                </p>
                <Textarea
                  id="budget-variance-note"
                  value={varianceNote}
                  onChange={(event) => onVarianceNote(event.target.value)}
                  rows={3}
                  maxLength={VARIANCE_NOTE_MAX}
                  aria-invalid={varianceError ? true : undefined}
                  aria-describedby={
                    varianceError ? "budget-variance-hint budget-variance-error" : "budget-variance-hint"
                  }
                  className="mt-2"
                />
                {varianceError ? (
                  <p id="budget-variance-error" className="mt-1.5 text-sm font-semibold text-bad">
                    {varianceError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
