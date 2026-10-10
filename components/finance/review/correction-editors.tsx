"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

export type TableColumnInfo = { key: string; label: string; type: "text" | "integer" | "currency" | "percent" };
export type TableRowDraft = Record<string, string>;
export type BudgetLineDraft = { rowId: string; category: "PS" | "OTPS"; description: string; amount: string };

export type CorrectableQuestion =
  | { kind: "value"; key: string; label: string; current: string }
  | { kind: "table"; key: string; label: string; columns: TableColumnInfo[]; rows: TableRowDraft[]; maxRows: number }
  | { kind: "budget"; key: string; label: string; lines: BudgetLineDraft[]; maxLines: number };

export function TableEditor({
  columns,
  rows,
  maxRows,
  onChange,
}: {
  columns: TableColumnInfo[];
  rows: TableRowDraft[];
  maxRows: number;
  onChange: (rows: TableRowDraft[]) => void;
}) {
  const update = (index: number, key: string, value: string) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  return (
    <div className="space-y-3">
      {rows.length === 0 ? <p className="text-sm text-muted">No rows. Add one below.</p> : null}
      {rows.map((row, index) => (
        <fieldset key={index} className="space-y-2 rounded border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold text-muted">Row {index + 1}</legend>
          {columns.map((column) => (
            <div key={column.key}>
              <label
                htmlFor={`corr-row-${index}-${column.key}`}
                className="mb-1 block text-[13px] font-semibold text-ink"
              >
                {column.label}
              </label>
              <Input
                id={`corr-row-${index}-${column.key}`}
                value={row[column.key] ?? ""}
                inputMode={column.type === "text" ? undefined : "decimal"}
                onChange={(event) => update(index, column.key, event.target.value)}
              />
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="px-0"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
            aria-label={`Remove row ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove row
          </Button>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={rows.length >= maxRows}
        onClick={() => onChange([...rows, Object.fromEntries(columns.map((column) => [column.key, ""]))])}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a row
      </Button>
    </div>
  );
}

export function BudgetEditor({
  lines,
  maxLines,
  onChange,
}: {
  lines: BudgetLineDraft[];
  maxLines: number;
  onChange: (lines: BudgetLineDraft[]) => void;
}) {
  const update = (index: number, patch: Partial<BudgetLineDraft>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  return (
    <div className="space-y-3">
      {lines.length === 0 ? <p className="text-sm text-muted">No budget lines. Add one below.</p> : null}
      {lines.map((line, index) => (
        <fieldset key={line.rowId} className="space-y-2 rounded border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold text-muted">Line {index + 1}</legend>
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <div>
              <label htmlFor={`corr-line-${index}-category`} className="mb-1 block text-[13px] font-semibold text-ink">
                Category
              </label>
              <Select
                id={`corr-line-${index}-category`}
                value={line.category}
                onChange={(event) => update(index, { category: event.target.value === "OTPS" ? "OTPS" : "PS" })}
              >
                <option value="PS">PS</option>
                <option value="OTPS">OTPS</option>
              </Select>
            </div>
            <div>
              <label htmlFor={`corr-line-${index}-amount`} className="mb-1 block text-[13px] font-semibold text-ink">
                Amount
              </label>
              <Input
                id={`corr-line-${index}-amount`}
                inputMode="decimal"
                value={line.amount}
                onChange={(event) => update(index, { amount: event.target.value })}
              />
            </div>
          </div>
          <div>
            <label htmlFor={`corr-line-${index}-description`} className="mb-1 block text-[13px] font-semibold text-ink">
              Description
            </label>
            <Input
              id={`corr-line-${index}-description`}
              value={line.description}
              onChange={(event) => update(index, { description: event.target.value })}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="px-0"
            onClick={() => onChange(lines.filter((_, i) => i !== index))}
            aria-label={`Remove line ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove line
          </Button>
        </fieldset>
      ))}
      <Button
        variant="secondary"
        size="sm"
        disabled={lines.length >= maxLines}
        onClick={() =>
          onChange([...lines, { rowId: crypto.randomUUID(), category: "OTPS", description: "", amount: "" }])
        }
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add a line
      </Button>
    </div>
  );
}
