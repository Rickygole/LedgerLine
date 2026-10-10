import { formatDate, formatDateTime, formatTime, isToday, todayInNewYork } from "@/lib/dates";
import { parseAmount } from "@/lib/rules/money";
import { formatCount, formatCurrency } from "@/lib/format";
import { balanceMessage, budgetTotals, isVisible } from "@/lib/rules/validate";
import type { AnswerValue, Answers, FormDefinition, Question } from "@/lib/rules/types";
import type { Certification } from "@/lib/rules/certify";
import { VARIANCE_NOTE_KEY, spendSummary } from "@/lib/rules/spend";
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
    return Number.isFinite(n) ? formatCount(n) : text;
  }
  return text;
}

export function cellText(type: string, raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (text === "" || type === "text") return text;
  if (type === "currency") {
    const amount = parseAmount(text);
    return amount === null ? text : formatCurrency(amount);
  }
  if (type === "percent") return text.endsWith("%") ? text : `${text}%`;
  return formatCount(text);
}

export function tableRows(question: Question, value: AnswerValue | undefined): string[][] {
  if (!Array.isArray(value)) return [];
  const columns = question.columns ?? [];
  return value
    .map((row) => columns.map((column) => cellText(column.type, row[column.key])))
    .filter((cells) => cells.some((cell) => cell !== ""));
}

type SummaryInput = {
  title: string;
  referenceNo: string;
  periodLabel: string;
  orgName: string;
  ein: string;
  awardAmount: number;
  definition: FormDefinition;
  answers: Answers;
  budget: { position: number; category: "PS" | "OTPS"; description: string; amount: number; actual?: number | null }[];
  attachments: { filename: string; bytes: number }[];
  certification?: Pick<Certification, "name" | "title" | "certifiedAt" | "statement">;
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
        const spent =
          line.actual === null || line.actual === undefined ? "" : `, actual spent ${formatCurrency(line.actual)}`;
        lines.push(`${line.position}. [${line.category}] ${line.description}: ${formatCurrency(line.amount)}${spent}`);
      }
      lines.push(`Personal services (PS) subtotal: ${formatCurrency(totals.ps)}`);
      lines.push(`Other than personal services (OTPS) subtotal: ${formatCurrency(totals.otps)}`);
      lines.push(`Total: ${formatCurrency(totals.total)}`);
      lines.push(`Award: ${formatCurrency(input.awardAmount)}`);
      lines.push(balanceMessage(totals.total, input.awardAmount).message);
      const spend = spendSummary(
        input.budget.map((line) => ({ ...line, rowId: String(line.position) })),
        input.awardAmount,
      );
      if (spend.entered) {
        lines.push(`Actual spent: ${formatCurrency(spend.actual)}`);
        lines.push(
          `Unspent balance: ${formatCurrency(spend.unspent)} (${spend.unspentPercent.toFixed(1)}% of the award)`,
        );
        const note = input.answers[VARIANCE_NOTE_KEY];
        if (typeof note === "string" && note.trim() !== "") lines.push(`Variance explanation: ${note.trim()}`);
      }
      continue;
    }
    for (const question of section.questions) {
      if (!isVisible(question, input.answers)) continue;
      const value = input.answers[question.key];
      if (question.type === "table") {
        lines.push(`${question.label}:`);
        const rows = tableRows(question, value);
        if (rows.length === 0) lines.push("  No rows entered.");
        const headers = (question.columns ?? []).map((column) => column.label);
        rows.forEach((row, index) =>
          lines.push(`  ${index + 1}. ${row.map((cell, i) => `${headers[i]}: ${cell || "not provided"}`).join("; ")}`),
        );
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
  if (input.certification) {
    lines.push("");
    lines.push("CERTIFICATION");
    lines.push("-------------");
    lines.push(input.certification.statement);
    lines.push(`${input.certification.name}, ${input.certification.title}`);
    lines.push(`Certified ${formatDateTime(input.certification.certifiedAt)} ET`);
  }
  lines.push("");
  lines.push("If Council Finance needs changes, the request appears in Messages.");
  return lines.join("\n");
}

const TZ = "America/New_York";

function asDate(value: string | Date): Date {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
}

export function formatShortDate(value: string | Date, today: string = todayInNewYork()): string {
  const date = asDate(value);
  const year = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric" }).format(date);
  if (year !== today.slice(0, 4)) return formatDate(date);
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(date);
}

export function savedAtLabel(value: string, today: string = todayInNewYork()): string {
  const when = new Date(value);
  return isToday(when, today) ? formatTime(when) : `${formatShortDate(when, today)}, ${formatTime(when)}`;
}

export function questionLabel(label: string): string {
  return label.replace(/\s*\(optional\)\s*$/i, "");
}
