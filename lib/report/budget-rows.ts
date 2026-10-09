import { parseAmount } from "@/lib/rules/money";
import type { BudgetLine, Issue } from "@/lib/rules/types";
import { RULES } from "@/lib/rules/validate";

export type BudgetRow = {
  rowId: string;
  category: "PS" | "OTPS";
  description: string;
  amountText: string;
  actualText: string;
};

const amountFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatAmountText(amount: number): string {
  return amountFormat.format(amount);
}

export function newRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function emptyRow(category: "PS" | "OTPS" = "PS"): BudgetRow {
  return { rowId: newRowId(), category, description: "", amountText: "", actualText: "" };
}

export function rowsFromLines(lines: BudgetLine[]): BudgetRow[] {
  return [...lines]
    .sort((a, b) => a.position - b.position)
    .map((line) => ({
      rowId: line.rowId,
      category: line.category,
      description: line.description,
      amountText: formatAmountText(line.amount),
      actualText: line.actual === null || line.actual === undefined ? "" : formatAmountText(line.actual),
    }));
}

const SAVE_LIMIT = 99_999_999_999.99;

function clamp(value: number): number {
  return Math.max(-SAVE_LIMIT, Math.min(SAVE_LIMIT, value));
}

export function linesFromRows(rows: BudgetRow[]): BudgetLine[] {
  return rows.map((row, index) => ({
    rowId: row.rowId,
    position: index + 1,
    category: row.category,
    description: row.description,
    amount: clamp(parseAmount(row.amountText) ?? 0),
    actual: row.actualText.trim() === "" ? null : clamp(parseAmount(row.actualText) ?? 0),
  }));
}

export function isBlankRow(row: BudgetRow): boolean {
  return row.description.trim() === "" && row.amountText.trim() === "" && row.actualText.trim() === "";
}

function textProblem(text: string): boolean {
  if (text.trim() === "") return false;
  if (parseAmount(text) === null) return true;
  const plain = text.replace(/[$\s,()-]/g, "");
  return /\.\d{3,}/.test(plain) && !/[kKmM]$/.test(plain);
}

export function amountProblem(row: BudgetRow): boolean {
  return textProblem(row.amountText);
}

export function actualProblem(row: BudgetRow): boolean {
  return textProblem(row.actualText);
}

export function amountIssues(rows: BudgetRow[]): Issue[] {
  const issues: Issue[] = [];
  rows.forEach((row, index) => {
    if (amountProblem(row)) {
      issues.push({ field: `budget.${row.rowId}`, ruleId: RULES.type, severity: "block", message: `Line ${index + 1}: enter the amount as a number with at most 2 decimal places, like 1,250.00.` });
    }
    if (actualProblem(row)) {
      issues.push({ field: `budget.${row.rowId}`, ruleId: RULES.type, severity: "block", message: `Line ${index + 1}: enter actual spent as a number with at most 2 decimal places, like 1,250.00.` });
    }
  });
  return issues;
}
