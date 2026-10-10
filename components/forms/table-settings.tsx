"use client";

import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Hint, Input, Label, Select } from "@/components/ui/field";
import {
  COLUMN_TYPES,
  COLUMN_TYPE_LABEL,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  newColumn,
} from "@/lib/forms/editor/definition";
import { isSummable } from "@/lib/rules/sums";
import type { Question, SumTarget, TableColumn } from "@/lib/rules/types";

type Props = {
  question: Question;
  disabled: boolean;
  onChange: (patch: Partial<Question>) => void;
};

export function TableSettings({ question, disabled, onChange }: Props) {
  const id = useId();
  const columns = question.columns ?? [];
  const rule = question.sumRule;
  const numeric = columns.filter((column) => isSummable(column.type));

  function setColumns(next: TableColumn[]) {
    const keep = rule && next.some((column) => column.key === rule.column && isSummable(column.type));
    onChange({ columns: next, sumRule: keep ? rule : undefined });
  }

  function patchColumn(index: number, patch: Partial<TableColumn>) {
    setColumns(columns.map((column, at) => (at === index ? { ...column, ...patch } : column)));
  }

  function setTarget(kind: "number" | "award", value: string) {
    if (!rule) return;
    const target: SumTarget = kind === "award" ? "award" : value === "" ? 0 : Number(value);
    onChange({ sumRule: { column: rule.column, target } });
  }

  return (
    <div className="space-y-4 sm:col-span-2">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Columns</legend>
        <Hint>One to {MAX_TABLE_COLUMNS} columns. Each row of the table has one value per column.</Hint>
        <ul className="space-y-2">
          {columns.map((column, index) => (
            <li key={column.key} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_11rem_auto]">
              <div>
                <Label htmlFor={`${id}-col-${index}`} className="text-xs">
                  Column {index + 1} label
                </Label>
                <Input
                  id={`${id}-col-${index}`}
                  value={column.label}
                  disabled={disabled}
                  maxLength={80}
                  onChange={(e) => patchColumn(index, { label: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor={`${id}-coltype-${index}`} className="text-xs">
                  Column {index + 1} type
                </Label>
                <Select
                  id={`${id}-coltype-${index}`}
                  value={column.type}
                  disabled={disabled}
                  onChange={(e) => patchColumn(index, { type: e.target.value as TableColumn["type"] })}
                >
                  {COLUMN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {COLUMN_TYPE_LABEL[type]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || columns.length <= 1}
                aria-label={`Remove column ${index + 1}`}
                onClick={() => setColumns(columns.filter((_, at) => at !== index))}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || columns.length >= MAX_TABLE_COLUMNS}
          onClick={() => setColumns([...columns, newColumn(columns, `Column ${columns.length + 1}`, "text")])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add column
        </Button>
      </fieldset>
      <div className="max-w-48">
        <Label htmlFor={`${id}-rows`}>Maximum rows</Label>
        <Input
          id={`${id}-rows`}
          type="number"
          min={1}
          max={MAX_TABLE_ROWS}
          className="num"
          value={question.maxRows ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ maxRows: e.target.value ? Number(e.target.value) : undefined })}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Column total</legend>
        <Hint>Require one numeric column to add up to a set value across all rows.</Hint>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_11rem_9rem]">
          <div>
            <Label htmlFor={`${id}-sum-col`} className="text-xs">
              Column that must add up
            </Label>
            <Select
              id={`${id}-sum-col`}
              value={rule?.column ?? ""}
              disabled={disabled || numeric.length === 0}
              onChange={(e) =>
                onChange({
                  sumRule: e.target.value ? { column: e.target.value, target: rule?.target ?? 100 } : undefined,
                })
              }
            >
              <option value="">No total required</option>
              {numeric.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label || column.key}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-sum-kind`} className="text-xs">
              Must equal
            </Label>
            <Select
              id={`${id}-sum-kind`}
              value={rule?.target === "award" ? "award" : "number"}
              disabled={disabled || !rule}
              onChange={(e) =>
                setTarget(
                  e.target.value as "number" | "award",
                  rule?.target === "award" ? "0" : String(rule?.target ?? 0),
                )
              }
            >
              <option value="number">A fixed number</option>
              <option value="award">The award</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-sum-value`} className="text-xs">
              Number
            </Label>
            <Input
              id={`${id}-sum-value`}
              type="number"
              min={0}
              step="any"
              className="num"
              value={rule && rule.target !== "award" ? rule.target : ""}
              disabled={disabled || !rule || rule.target === "award"}
              onChange={(e) => setTarget("number", e.target.value)}
            />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
