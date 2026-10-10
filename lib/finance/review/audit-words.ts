import { statusLabel } from "@/lib/domain";
import { counted, formatCurrency } from "@/lib/format";
export { actionInWords } from "@/lib/finance/audit-actions";

export function statusInWords(status: unknown): string {
  return typeof status === "string" ? statusLabel(status) : "";
}

type AuditLine = {
  row_id?: string;
  position?: number;
  category?: string;
  description?: string;
  amount?: number;
};

function isLines(value: unknown): value is AuditLine[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && "category" in item);
}

export function correctionValueInWords(value: unknown): string {
  if (value === null || value === undefined || value === "") return "blank";
  if (isLines(value)) {
    const total = value.reduce((sum, line) => sum + Math.round((line.amount ?? 0) * 100), 0) / 100;
    return `${counted(value.length, "line")}, ${formatCurrency(total)}`;
  }
  if (Array.isArray(value)) return counted(value.length, "row");
  return String(value);
}

function lineText(line: AuditLine): string {
  return `${line.category} ${line.description}, ${formatCurrency(line.amount ?? 0)}`;
}

export function correctionChanges(before: unknown, after: unknown): string[] {
  if (isLines(before) && isLines(after)) {
    const old = new Map(before.map((line) => [line.row_id, line]));
    const kept = new Set(after.map((line) => line.row_id));
    const out: string[] = [];
    for (const line of after) {
      const was = old.get(line.row_id);
      if (!was) {
        out.push(`Added line ${line.position}: ${lineText(line)}`);
        continue;
      }
      const parts: string[] = [];
      if (was.amount !== line.amount)
        parts.push(`amount ${formatCurrency(was.amount ?? 0)} to ${formatCurrency(line.amount ?? 0)}`);
      if (was.category !== line.category) parts.push(`category ${was.category} to ${line.category}`);
      if (was.description !== line.description) parts.push(`description "${was.description}" to "${line.description}"`);
      if (parts.length > 0) out.push(`Line ${line.position}: ${parts.join("; ")}`);
    }
    for (const line of before) if (!kept.has(line.row_id)) out.push(`Removed line ${line.position}: ${lineText(line)}`);
    return out;
  }
  return [];
}
