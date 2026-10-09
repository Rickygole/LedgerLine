import { formatDate } from "@/lib/dates";
import { formatCurrency, parseAmount } from "@/lib/rules/money";
import { balanceMessage, budgetTotals, isVisible } from "@/lib/rules/validate";
import type { AnswerValue, Answers, FormDefinition, Question } from "@/lib/rules/types";
import { formatBytes } from "./upload-rules";

export function displayScalar(question: Question, value: AnswerValue | undefined): string {
  if (value === null || value === undefined || Array.isArray(value)) return "";
  const text = String(value).trim();
  if (text === "") return "";
  if (question.type === "currency") {
    const amount = parseAmount(text);
    return amount === null ? text : formatCurrency(amount);
  }
  if (question.type === "percent") return text.endsWith("%") ? text : `${text}%`;
  if (question.type === "date") return formatDate(text);
  if (question.type === "integer" || question.type === "number") {
    const n = Number(text.replace(/,/g, ""));
    return Number.isFinite(n) ? n.toLocaleString("en-US") : text;
  }
  return text;
}

export function tableRows(question: Question, value: AnswerValue | undefined): string[][] {
  if (!Array.isArray(value)) return [];
  const columns = question.columns ?? [];
  return value.map((row) => columns.map((column) => String(row[column.key] ?? "")));
}

export type SummaryInput = {
  title: string;
  referenceNo: string;
  periodLabel: string;
  orgName: string;
  ein: string;
  awardAmount: number;
  definition: FormDefinition;
  answers: Answers;
  budget: { position: number; category: "PS" | "OTPS"; description: string; amount: number }[];
  attachments: { filename: string; bytes: number }[];
};

export function plainTextReport(input: SummaryInput): string {
  const lines: string[] = [];
  lines.push(`${input.title}, ${input.periodLabel}`);
  lines.push(`Reference number: ${input.referenceNo}`);
  lines.push(`Organization: ${input.orgName} (EIN ${input.ein})`);
  lines.push("");
  lines.push("This is a copy of what you submitted. Keep it for your records.");

  for (const section of input.definition.sections) {
    lines.push("");
    lines.push(section.title.toUpperCase());
    lines.push("-".repeat(section.title.length));
    if (section.kind === "budget") {
      const totals = budgetTotals(input.budget.map((line) => ({ ...line, rowId: String(line.position) })));
      for (const line of input.budget) {
        lines.push(`${line.position}. [${line.category}] ${line.description}: ${formatCurrency(line.amount)}`);
      }
      lines.push(`PS subtotal: ${formatCurrency(totals.ps)}`);
      lines.push(`OTPS subtotal: ${formatCurrency(totals.otps)}`);
      lines.push(`Total: ${formatCurrency(totals.total)}`);
      lines.push(`Award: ${formatCurrency(input.awardAmount)}`);
      lines.push(balanceMessage(totals.total, input.awardAmount).message);
      continue;
    }
    for (const question of section.questions) {
      if (!isVisible(question, input.answers)) continue;
      const value = input.answers[question.key];
      if (question.type === "table") {
        lines.push(`${question.label}:`);
        const rows = tableRows(question, value);
        if (rows.length === 0) lines.push("  (none)");
        const headers = (question.columns ?? []).map((column) => column.label);
        rows.forEach((row, index) => lines.push(`  ${index + 1}. ${row.map((cell, i) => `${headers[i]}: ${cell || "(blank)"}`).join("; ")}`));
        continue;
      }
      const shown = displayScalar(question, value);
      lines.push(`${question.label}: ${shown === "" ? "(not answered)" : shown}`);
    }
  }

  lines.push("");
  lines.push("ATTACHMENTS");
  lines.push("-----------");
  if (input.attachments.length === 0) lines.push("None");
  for (const file of input.attachments) lines.push(`${file.filename} (${formatBytes(file.bytes)})`);
  lines.push("");
  lines.push("We will email you if Finance needs changes.");
  return lines.join("\n");
}
