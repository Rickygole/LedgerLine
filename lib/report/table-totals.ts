import { toCents } from "@/lib/rules/money";
import { isSummable, numberOf } from "@/lib/rules/sums";
import type { AnswerValue, Question, TableColumn } from "@/lib/rules/types";
import { cellText } from "./cell-text";

export type ColumnTotal = {
  key: string;
  label: string;
  type: TableColumn["type"];
  entries: number;
  total: number;
  text: string;
  goal: string | null;
  met: boolean | null;
};

export function columnTotals(question: Question, value: AnswerValue | undefined, award?: number): ColumnTotal[] {
  const rows = Array.isArray(value) ? value : [];
  return (question.columns ?? [])
    .filter((column) => isSummable(column.type))
    .map((column) => {
      let cents = 0;
      let entries = 0;
      for (const row of rows) {
        const amount = numberOf(row[column.key]);
        if (amount === null) continue;
        entries += 1;
        cents += toCents(amount);
      }
      const total = cents / 100;
      const rule = question.sumRule && question.sumRule.column === column.key ? question.sumRule : null;
      let goal: string | null = null;
      let met: boolean | null = null;
      if (rule) {
        const target = rule.target === "award" ? award : rule.target;
        goal = target === undefined ? "the award" : cellText(column.type, String(target));
        met = target === undefined ? null : toCents(target) === cents;
      }
      return {
        key: column.key,
        label: column.label,
        type: column.type,
        entries,
        total,
        text: cellText(column.type, String(total)),
        goal,
        met,
      };
    });
}

export function totalWithGoal(total: ColumnTotal): string {
  return total.goal === null ? total.text : `${total.text} of ${total.goal}`;
}

export function totalsAnnouncement(totals: ColumnTotal[]): string {
  return `Totals: ${totals.map((total) => `${total.label} ${totalWithGoal(total)}`).join(", ")}.`;
}

export function totalsRow(question: Question, value: AnswerValue | undefined, award?: number): string[] | null {
  const columns = question.columns ?? [];
  const totals = columnTotals(question, value, award);
  if (totals.every((total) => total.entries === 0)) return null;
  const byKey = new Map(totals.map((total) => [total.key, total]));
  const labelAt = columns.findIndex((column) => column.type === "text");
  const firstNumeric = columns.findIndex((column) => byKey.has(column.key));
  return columns.map((column, index) => {
    const total = byKey.get(column.key);
    const shown = total && total.entries > 0 ? totalWithGoal(total) : "";
    if (index === labelAt) return "Total";
    if (labelAt < 0 && index === firstNumeric) return `Total: ${shown}`.trimEnd();
    return shown;
  });
}
