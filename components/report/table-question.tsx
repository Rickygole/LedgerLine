"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { columnTotals, totalsAnnouncement, totalWithGoal } from "@/lib/report/table-totals";
import { cn } from "@/lib/cn";
import { NumericInput } from "./numeric-input";
import type { Question } from "@/lib/rules/types";

export type TableRow = Record<string, string | number | null>;

function cellValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

export function TableQuestion({
  question,
  rows,
  onChange,
  onBlur,
  describedBy,
  invalid,
  award,
}: {
  question: Question;
  rows: TableRow[];
  onChange: (rows: TableRow[]) => void;
  onBlur: () => void;
  describedBy?: string;
  invalid?: boolean;
  award?: number;
}) {
  const columns = question.columns ?? [];
  const maxRows = question.maxRows ?? 50;
  const atLimit = rows.length >= maxRows;
  const totals = columnTotals(question, rows, award);

  function update(rowIndex: number, key: string, value: string) {
    onChange(rows.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row)));
  }

  function addRow() {
    if (atLimit) return;
    onChange([...rows, Object.fromEntries(columns.map((column) => [column.key, ""]))]);
  }

  function removeRow(rowIndex: number) {
    onChange(rows.filter((_, index) => index !== rowIndex));
  }

  return (
    <div
      id={`q-${question.key}`}
      role="group"
      aria-labelledby={`q-${question.key}-legend`}
      tabIndex={-1}
      aria-describedby={describedBy}
      className="rounded-md border border-line"
    >
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted">No rows yet. Use Add row to start the table.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row, rowIndex) => (
            <li key={rowIndex} className="flex flex-wrap items-end gap-3 px-4 py-3">
              {columns.map((column) => {
                const id = `q-${question.key}-${rowIndex}-${column.key}`;
                const numeric = column.type !== "text";
                return (
                  <div key={column.key} className="min-w-[10rem] flex-1">
                    <label htmlFor={id} className="mb-1 block text-xs font-semibold text-muted">
                      {column.label}
                      <span className="sr-only">, row {rowIndex + 1}</span>
                    </label>
                    {numeric ? (
                      <NumericInput
                        id={id}
                        kind={column.type as "integer" | "currency" | "percent"}
                        value={cellValue(row[column.key])}
                        aria-invalid={invalid || undefined}
                        onValueChange={(next) => update(rowIndex, column.key, next)}
                        onBlur={onBlur}
                        className="num text-right"
                      />
                    ) : (
                      <Input
                        id={id}
                        value={cellValue(row[column.key])}
                        aria-invalid={invalid || undefined}
                        onChange={(event) => update(rowIndex, column.key, event.target.value)}
                        onBlur={onBlur}
                      />
                    )}
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeRow(rowIndex)}
                aria-label={`Remove row ${rowIndex + 1} from ${question.label}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && totals.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3 border-t border-line bg-surface/40 px-4 py-3">
          {columns.map((column, index) => {
            const total = totals.find((candidate) => candidate.key === column.key);
            const firstText = columns.findIndex((candidate) => candidate.type === "text");
            return (
              <div key={column.key} className="min-w-[10rem] flex-1">
                {index === firstText ? (
                  <span className="block text-sm font-bold text-ink">Total</span>
                ) : total ? (
                  <span
                    data-testid={`total-${question.key}-${column.key}`}
                    className={cn(
                      "num block text-right text-sm font-bold",
                      total.met === true ? "text-ok" : "text-ink",
                    )}
                  >
                    <span className="sr-only">Total {column.label}: </span>
                    {totalWithGoal(total)}
                  </span>
                ) : null}
              </div>
            );
          })}
          <span aria-hidden="true" className="invisible inline-flex h-9 items-center gap-2 px-3 text-sm font-bold">
            <Trash2 className="h-4 w-4" />
            Remove
          </span>
        </div>
      ) : null}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {rows.length > 0 && totals.length > 0 ? totalsAnnouncement(totals) : ""}
      </p>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface/60 px-4 py-2.5">
        <Button variant="secondary" size="sm" onClick={addRow} disabled={atLimit}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add row
        </Button>
        <p className="text-xs text-muted">
          {rows.length} of {maxRows} rows{atLimit ? ". You have reached the limit." : ""}
        </p>
      </div>
    </div>
  );
}
