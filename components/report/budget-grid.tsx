"use client";

import { AlertCircle, AlertTriangle, CheckCircle2, ClipboardPaste, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { amountProblem, emptyRow, formatAmountText, isBlankRow, linesFromRows, newRowId, type BudgetRow } from "@/lib/report/budget-rows";
import { formatCurrency, parseAmount } from "@/lib/rules/money";
import { balanceCopy } from "./balance";
import { parseBudgetPaste } from "@/lib/rules/paste";
import { budgetTotals } from "@/lib/rules/validate";

const COLS = "min-[720px]:grid min-[720px]:grid-cols-[3rem_7.5rem_minmax(0,1fr)_11rem_2.75rem] min-[720px]:items-stretch";

const cell =
  "block h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-navy-600 min-[720px]:rounded-none min-[720px]:border-0 min-[720px]:bg-transparent min-[720px]:hover:bg-navy-50/50 aria-[invalid=true]:border-bad aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-inset aria-[invalid=true]:ring-bad/60";

type Toast = { tone: "ok" | "warn"; text: string };

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
  const [toast, setToast] = useState<Toast | null>(null);
  const [note, setNote] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const focusRow = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);

  const lines = useMemo(() => linesFromRows(rows), [rows]);
  const totals = useMemo(() => budgetTotals(lines), [lines]);
  const balance = balanceCopy(totals.total, award);
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

  function removeRow(rowId: string, n: number) {
    onChange(rows.filter((row) => row.rowId !== rowId));
    setNote(`Line ${n} removed.`);
    addButton.current?.focus();
  }

  function applyPaste(text: string): boolean {
    const result = parseBudgetPaste(text);
    const base = rows.filter((row) => !isBlankRow(row));
    const room = Math.max(0, maxLines - base.length);
    const accepted = result.rows.slice(0, room);
    const trimmed = result.rows.length - accepted.length;
    const added = accepted.map((row) => ({ rowId: newRowId(), category: row.category, description: row.description, amountText: formatAmountText(row.amount) }));
    const skipped = result.skipped.length + trimmed;

    if (added.length === 0) {
      setToast({ tone: "warn", text: "No rows were added. Copy rows from Excel with category, description and amount columns, then paste again." });
      return false;
    }

    const reasons = [
      ...result.skipped.map((item) => `row ${item.line}: ${item.reason.toLowerCase()}`),
      ...(trimmed > 0 ? [`${trimmed} over the ${maxLines} line limit`] : []),
    ];
    const summary = `${added.length} ${added.length === 1 ? "row" : "rows"} added${skipped > 0 ? `, ${skipped} skipped (${reasons.join("; ")})` : ""}`;
    setToast({ tone: skipped > 0 ? "warn" : "ok", text: summary });

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

  const BalanceIcon = balance.tone === "ok" ? CheckCircle2 : balance.tone === "warn" ? AlertTriangle : AlertCircle;

  return (
    <div id="budget-grid" tabIndex={-1} onPaste={onPaste} className="rounded-lg border border-line bg-white focus:outline-none">
      <div className="sticky top-[3.75rem] z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-t-lg border-b border-line bg-white/95 px-3 py-2.5 backdrop-blur sm:px-4">
        <div className="flex flex-wrap gap-2">
          <Button ref={addButton} variant="secondary" size="sm" onClick={addRow} disabled={atLimit}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add line
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPasteOpen((open) => !open)} aria-expanded={pasteOpen} aria-controls="budget-paste-panel">
            <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
            Paste box
          </Button>
        </div>
        <div aria-live="polite" aria-atomic="true" className="ml-auto">
          <p
            className={cn(
              "num inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset",
              balance.tone === "ok" && "bg-ok-bg text-ok ring-ok/25",
              balance.tone === "warn" && "bg-warn-bg text-warn ring-warn/30",
              balance.tone === "bad" && "bg-bad-bg text-bad ring-bad/25"
            )}
          >
            <BalanceIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {balance.text}
          </p>
        </div>
      </div>

      <p className="flex items-start gap-2 border-b border-line bg-surface/60 px-3 py-2 text-sm text-muted sm:px-4">
        <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Paste rows from Excel. Columns: category, description, amount. <span className="num">{rows.length}</span> of <span className="num">{maxLines}</span> lines used.
        </span>
      </p>

      {pasteOpen ? (
        <div id="budget-paste-panel" className="border-b border-line bg-navy-50/50 px-3 py-4 sm:px-4">
          <label htmlFor="budget-paste-text" className="mb-1 block text-sm font-semibold text-ink">
            Paste your rows here
          </label>
          <p className="mb-2 text-sm text-muted">Use this box if pasting straight into the table does not work in your browser.</p>
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
          <div className={cn("flex items-start justify-between gap-3 border-b border-line px-3 py-2.5 text-sm sm:px-4", toast.tone === "ok" ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn")}>
            <p className="flex items-start gap-2 font-semibold">
              {toast.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className="num">{toast.text}</span>
            </p>
            <button type="button" onClick={() => setToast(null)} className="-m-1 rounded p-1 hover:bg-black/5" aria-label="Dismiss paste summary">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <span className="sr-only">{note}</span>
      </div>

      {gridError ? <p className="border-b border-line px-4 py-2.5 text-sm font-semibold text-bad">{gridError}</p> : null}

      <div className={cn("hidden h-10 border-b border-line bg-surface min-[720px]:items-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted", COLS)}>
        <span className="px-3 text-right">#</span>
        <span className="px-3">Category</span>
        <span className="px-3">Description</span>
        <span className="px-3 text-right">Amount</span>
        <span className="sr-only">Actions</span>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <ClipboardPaste className="h-6 w-6 text-muted" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-ink">No budget lines yet</p>
          <p className="max-w-sm text-sm text-muted">Copy your rows in Excel and paste them anywhere in this table, or add lines one at a time.</p>
        </div>
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
                  "transition-colors max-[719px]:m-3 max-[719px]:grid max-[719px]:grid-cols-[6.5rem_minmax(0,1fr)] max-[719px]:gap-3 max-[719px]:rounded-md max-[719px]:border max-[719px]:border-line max-[719px]:p-3 min-[720px]:border-b min-[720px]:border-line",
                  COLS,
                  highlight.has(row.rowId) && "bg-info-bg"
                )}
              >
                <p className="num flex items-center justify-between text-sm font-semibold text-muted max-[719px]:col-span-2 min-[720px]:justify-end min-[720px]:border-r min-[720px]:border-line min-[720px]:px-3">
                  <span>
                    <span className="min-[720px]:sr-only">Line </span>
                    {n}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => removeRow(row.rowId, n)} aria-label={`Remove line ${n}`} className="min-[720px]:hidden">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </Button>
                </p>
                <div className="min-[720px]:border-r min-[720px]:border-line">
                  <label htmlFor={`budget-cat-${row.rowId}`} className="mb-1 block text-xs font-semibold text-muted min-[720px]:sr-only">
                    <span className="sr-only">Line {n} </span>
                    Category
                  </label>
                  <select id={`budget-cat-${row.rowId}`} value={row.category} onChange={(event) => update(row.rowId, { category: event.target.value as "PS" | "OTPS" })} className={cn(cell, "pr-8")}>
                    <option value="PS">PS</option>
                    <option value="OTPS">OTPS</option>
                  </select>
                </div>
                <div className="max-[719px]:order-last max-[719px]:col-span-2 min-[720px]:border-r min-[720px]:border-line">
                  <label htmlFor={`budget-desc-${row.rowId}`} className="mb-1 block text-xs font-semibold text-muted min-[720px]:sr-only">
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
                <div className="min-[720px]:border-r min-[720px]:border-line">
                  <label htmlFor={`budget-amt-${row.rowId}`} className="mb-1 block text-xs font-semibold text-muted min-[720px]:sr-only">
                    <span className="sr-only">Line {n} </span>
                    Amount
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted" aria-hidden="true">
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
                <div className="hidden items-center justify-center min-[720px]:flex">
                  <button type="button" onClick={() => removeRow(row.rowId, n)} aria-label={`Remove line ${n}`} className="rounded-md p-2 text-muted hover:bg-bad-bg hover:text-bad">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                {error ? (
                  <p id={errorId} className="text-sm font-semibold text-bad max-[719px]:order-last max-[719px]:col-span-2 min-[720px]:col-span-5 min-[720px]:border-t min-[720px]:border-line min-[720px]:bg-bad-bg/40 min-[720px]:px-3 min-[720px]:py-1.5 min-[720px]:pl-[3.75rem]">
                    {error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <dl className="rounded-b-lg border-t border-line bg-surface/60 text-sm">
        {[
          ["PS subtotal", totals.ps],
          ["OTPS subtotal", totals.otps],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-3 py-2 sm:px-4 min-[720px]:pr-[3.5rem]!">
            <dt className="text-muted">{label}</dt>
            <dd className="num text-ink">{formatCurrency(value as number)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-t border-line px-3 py-2.5 sm:px-4 min-[720px]:pr-[3.5rem]!">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="num font-bold text-ink">{formatCurrency(totals.total)}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-3 pb-2.5 sm:px-4 min-[720px]:pr-[3.5rem]!">
          <dt className="text-muted">Award</dt>
          <dd className="num text-muted">{formatCurrency(award)}</dd>
        </div>
      </dl>
    </div>
  );
}
