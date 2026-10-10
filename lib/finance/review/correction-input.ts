import { amountBoundsProblem } from "@/lib/rules/bounds";
import { parseAmount, toCents } from "@/lib/rules/money";
import type { AnswerValue, BudgetLine, Question } from "@/lib/rules/types";

export type CorrectionParse<T> = { ok: true; value: T } | { ok: false; message: string };

export const BUDGET_KEY = "budget";
const DESCRIPTION_MAX = 500;
const CELL_MAX = 1000;

function fail<T>(message: string): CorrectionParse<T> {
  return { ok: false, message };
}

function amountField(raw: unknown, label: string): CorrectionParse<number | null> {
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  if (text === "") return { ok: true, value: null };
  const parsed = parseAmount(text);
  const plain = text.replace(/[$\s,()-]/g, "");
  if (parsed === null || (/\.\d{3,}/.test(plain) && !/[kKmM]$/.test(plain)))
    return fail(`${label} must be a number with at most 2 decimal places, like 1,250.00.`);
  const bounds = amountBoundsProblem(parsed, label);
  if (bounds) return fail(bounds);
  return { ok: true, value: parsed };
}

export function parseBudgetCorrection(
  raw: string,
  existing: BudgetLine[],
  newId: () => string,
  maxLines: number,
): CorrectionParse<BudgetLine[]> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail("The budget lines could not be read. Reload the page and try again.");
  }
  if (!Array.isArray(data)) return fail("The budget lines could not be read. Reload the page and try again.");
  if (data.length > maxLines) return fail(`The budget can have at most ${maxLines} lines.`);
  const known = new Map(existing.map((line) => [line.rowId, line]));
  const seen = new Set<string>();
  const lines: BudgetLine[] = [];
  for (let index = 0; index < data.length; index += 1) {
    const item = data[index] as Record<string, unknown> | null;
    const label = `Line ${index + 1}`;
    if (!item || typeof item !== "object") return fail(`${label} could not be read.`);
    const category = item.category;
    if (category !== "PS" && category !== "OTPS") return fail(`${label}: choose PS or OTPS.`);
    const description = String(item.description ?? "").trim();
    if (description === "") return fail(`${label}: enter a description.`);
    if (description.length > DESCRIPTION_MAX)
      return fail(`${label}: shorten the description to ${DESCRIPTION_MAX} characters or fewer.`);
    const amount = amountField(item.amount, `${label}: the amount`);
    if (!amount.ok) return amount;
    if (amount.value === null) return fail(`${label}: enter an amount.`);
    const rowId = typeof item.rowId === "string" && known.has(item.rowId) ? item.rowId : newId();
    if (seen.has(rowId)) return fail(`${label} appears twice.`);
    seen.add(rowId);
    lines.push({
      rowId,
      position: index + 1,
      category,
      description,
      amount: toCents(amount.value) / 100,
      actual: known.get(rowId)?.actual ?? null,
    });
  }
  return { ok: true, value: lines };
}

export function parseTableCorrection(raw: string, question: Question): CorrectionParse<AnswerValue> {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return fail("The table rows could not be read. Reload the page and try again.");
  }
  if (!Array.isArray(data)) return fail("The table rows could not be read. Reload the page and try again.");
  const columns = question.columns ?? [];
  const rows: Array<Record<string, string>> = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row: Record<string, string> = {};
    for (const column of columns) {
      const cell = String((item as Record<string, unknown>)[column.key] ?? "").trim();
      if (cell.length > CELL_MAX) return fail(`Shorten ${column.label} to ${CELL_MAX} characters or fewer.`);
      row[column.key] = cell;
    }
    if (Object.values(row).some((cell) => cell !== "")) rows.push(row);
  }
  if (question.maxRows && rows.length > question.maxRows)
    return fail(`${question.label} can have at most ${question.maxRows} rows.`);
  return { ok: true, value: rows };
}

export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function budgetAudit(lines: BudgetLine[]) {
  return lines.map((line) => ({
    row_id: line.rowId,
    position: line.position,
    category: line.category,
    description: line.description,
    amount: line.amount,
    actual_spent: line.actual ?? null,
  }));
}
