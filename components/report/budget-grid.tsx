"use client";

import { AlertCircle, CheckCircle2, ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Input } from "@/components/ui/field";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { amountProblem, emptyRow, formatAmountText, isBlankRow, linesFromRows, newRowId, type BudgetRow } from "@/lib/report/budget-rows";
import { formatCurrency, parseAmount } from "@/lib/rules/money";
import { parseBudgetPaste } from "@/lib/rules/paste";
import { balanceMessage, budgetTotals } from "@/lib/rules/validate";

const ROW_GRID = "min-[720px]:grid min-[720px]:grid-cols-[4rem_9rem_minmax(0,1fr)_11rem_6rem] min-[720px]:items-start min-[720px]:gap-3";

export function BudgetGrid({
  rows,
  onChange,
  award,
  maxLines,
  rowErrors,
  gridError,
}: {
  rows: BudgetRow[];
  onChange: (rows: BudgetRow[]) => void;
  award: number;
  maxLines: number;
  rowErrors: Record<string, string>;
  gridError?: string;
}) {
  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const focusRow = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const lines = useMemo(() => linesFromRows(rows), [rows]);
  const totals = useMemo(() => budgetTotals(lines), [lines]);
  const balance = balanceMessage(totals.total, award);
  const atLimit = rows.length >= maxLines;

  useEffect(() => {
    if (focusRow.current) {
      document.getElementById(`budget-desc-${focusRow.current}`)?.focus();
      focusRow.current = null;
    }
  });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
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

  function removeRow(rowId: string) {
    onChange(rows.filter((row) => row.rowId !== rowId));
    setNote("Line removed.");
    addButton.current?.focus();
  }

  function applyPaste(text: string): boolean {
    const result = parseBudgetPaste(text);
    const base = rows.filter((row) => !isBlankRow(row));
    const room = Math.max(0, maxLines - base.length);
    const accepted = result.rows.slice(0, room);
    const trimmed = result.rows.length - accepted.length;
    const added = accepted.map((row) => ({ rowId: newRowId(), category: row.category, description: row.description, amountText: formatAmountText(row.amount) }));

    const parts: string[] = [];
    if (added.length > 0) parts.push(`Added ${added.length} ${added.length === 1 ? "line" : "lines"} from your paste.`);
    else parts.push("No budget lines were found in what you pasted. Copy rows from Excel with Category, Description and Amount columns.");
    if (trimmed > 0) parts.push(`${trimmed} ${trimmed === 1 ? "line was" : "lines were"} not added because the budget can have at most ${maxLines} lines.`);
    if (result.skipped.length > 0) {
      const detail = result.skipped.map((item) => `pasted line ${item.line} (${item.reason.toLowerCase()})`).join(", ");
      parts.push(`Skipped ${result.skipped.length} ${result.skipped.length === 1 ? "line" : "lines"}: ${detail}.`);
    }
    setNote(parts.join(" "));
    if (added.length === 0) return false;

    onChange([...base, ...added]);
    setHighlight(new Set(added.map((row) => row.rowId)));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlight(new Set()), 2600);
    return true;
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const text = event.clipboardData.getData("text");
    if (!/[\t\n]/.test(text.trim())) return;
    event.preventDefault();
    applyPaste(text);
  }

  return (
    <div id="budget-grid" tabIndex={-1} onPaste={onPaste} className="rounded-md border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/60 px-4 py-3">
        <p className="text-sm text-muted">
          {rows.length} of {maxLines} lines. Paste rows copied from Excel anywhere in this table.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setPasteOpen((open) => !open)} aria-expanded={pasteOpen} aria-controls="budget-paste-panel">
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            Paste from Excel
          </Button>
          <Button ref={addButton} variant="secondary" size="sm" onClick={addRow} disabled={atLimit}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add line
          </Button>
        </div>
      </div>

      {pasteOpen ? (
        <div id="budget-paste-panel" className="border-b border-line bg-navy-50/50 px-4 py-4">
          <label htmlFor="budget-paste-text" className="mb-1 block text-sm font-semibold text-ink">
            Paste your rows here
          </label>
          <p className="mb-2 text-sm text-muted">Copy rows from Excel with the columns Category (PS or OTPS), Description and Amount, then paste them into this box.</p>
          <Textarea id="budget-paste-text" value={pasteText} onChange={(event) => setPasteText(event.target.value)} rows={5} className="font-mono text-xs" />
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (applyPaste(pasteText)) {
                  setPasteText("");
                  setPasteOpen(false);
                }
              }}
              disabled={pasteText.trim() === ""}
            >
              Add pasted lines
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <p role="status" aria-live="polite" className={cn("px-4 text-sm", note ? "py-2.5 text-ink border-b border-line bg-info-bg" : "sr-only")}>
        {note}
      </p>

      {gridError ? (
        <p className="px-4 pt-3 text-sm font-semibold text-bad">{gridError}</p>
      ) : null}

      <div className="hidden border-b border-line bg-surface/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted min-[720px]:grid min-[720px]:grid-cols-[4rem_9rem_minmax(0,1fr)_11rem_6rem] min-[720px]:gap-3">
        <span>Line</span>
        <span>Category</span>
        <span>Description</span>
        <span className="text-right">Amount</span>
        <span className="sr-only">Actions</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No budget lines yet. Add a line or paste rows from Excel.</p>
      ) : (
        <ul>
          {rows.map((row, index) => {
            const n = index + 1;
            const error = rowErrors[row.rowId];
            const badAmount = amountProblem(row);
            const errorId = `budget-row-error-${row.rowId}`;
            return (
              <li
                key={row.rowId}
                className={cn(
                  "border-b border-line px-4 py-3 transition-colors last:border-0 max-[719px]:m-3 max-[719px]:rounded-md max-[719px]:border max-[719px]:bg-white max-[719px]:last:border",
                  ROW_GRID,
                  highlight.has(row.rowId) && "bg-info-bg ring-1 ring-inset ring-navy-600/30"
                )}
              >
                <p className="num pt-2 text-sm font-semibold text-muted max-[719px]:pb-2 max-[719px]:pt-0">
                  <span className="min-[720px]:sr-only">Line </span>
                  {n}
                </p>
                <div className="max-[719px]:mb-3">
                  <label htmlFor={`budget-cat-${row.rowId}`} className="mb-1 block text-xs font-semibold text-muted min-[720px]:sr-only">
                    <span className="sr-only">Line {n} </span>
                    <span>Category</span>
                  </label>
                  <Select id={`budget-cat-${row.rowId}`} value={row.category} onChange={(event) => update(row.rowId, { category: event.target.value as "PS" | "OTPS" })}>
                    <option value="PS">PS (personnel)</option>
                    <option value="OTPS">OTPS (other)</option>
                  </Select>
                </div>
                <div className="max-[719px]:mb-3">
                  <label htmlFor={`budget-desc-${row.rowId}`} className="mb-1 block text-xs font-semibold text-muted min-[720px]:sr-only">
                    <span className="sr-only">Line {n} </span>
                    <span>Description</span>
                  </label>
                  <Input
                    id={`budget-desc-${row.rowId}`}
                    value={row.description}
                    aria-invalid={error && !badAmount ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    onChange={(event) => update(row.rowId, { description: event.target.value })}
                    maxLength={500}
                  />
                </div>
                <div className="max-[719px]:mb-3">
                  <label htmlFor={`budget-amt-${row.rowId}`} className="mb-1 block text-xs font-semibold text-muted min-[720px]:sr-only">
                    <span className="sr-only">Line {n} </span>
                    <span>Amount</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted" aria-hidden="true">
                      $
                    </span>
                    <Input
                      id={`budget-amt-${row.rowId}`}
                      inputMode="decimal"
                      value={row.amountText}
                      aria-invalid={badAmount || undefined}
                      aria-describedby={badAmount ? errorId : undefined}
                      onChange={(event) => update(row.rowId, { amountText: event.target.value })}
                      onBlur={() => {
                        const parsed = parseAmount(row.amountText);
                        if (parsed !== null) update(row.rowId, { amountText: formatAmountText(parsed) });
                      }}
                      className="num pl-7 text-right"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => removeRow(row.rowId)} aria-label={`Remove line ${n}`}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span className="min-[720px]:sr-only">Remove</span>
                  </Button>
                </div>
                {error ? (
                  <p id={errorId} className="mt-1 text-sm font-semibold text-bad min-[720px]:col-span-5 min-[720px]:col-start-1 min-[720px]:pl-[4.75rem]">
                    {error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="sticky bottom-0 z-10 rounded-b-md border-t border-line bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(16,24,40,0.06)] backdrop-blur">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm min-[720px]:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">PS subtotal</dt>
            <dd className="num font-semibold text-ink">{formatCurrency(totals.ps)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">OTPS subtotal</dt>
            <dd className="num font-semibold text-ink">{formatCurrency(totals.otps)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Total</dt>
            <dd className="num font-semibold text-ink">{formatCurrency(totals.total)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Award</dt>
            <dd className="num font-semibold text-ink">{formatCurrency(award)}</dd>
          </div>
        </dl>
        <div aria-live="polite" className="mt-2.5">
          <p
            className={cn(
              "inline-flex items-start gap-2 rounded-md px-3 py-1.5 text-sm font-semibold ring-1 ring-inset",
              balance.balanced ? "bg-ok-bg text-ok ring-ok/20" : "bg-bad-bg text-bad ring-bad/20"
            )}
          >
            {balance.balanced ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <span>{balance.message}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
