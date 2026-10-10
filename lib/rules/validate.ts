import { amountBoundsProblem, numericProblem } from "./bounds";
import { personNameProblem } from "./person-name";
import { sumAmounts, toCents } from "./money";
import { sumIssues } from "./sums";
import { formatCurrency } from "@/lib/format";
import type { AnswerValue, Answers, BudgetLine, FormDefinition, Issue, Question, ValidationInput } from "./types";

export const RULES = {
  required: "BR-021",
  budgetBalance: "BR-022",
  budgetLines: "BR-008",
  type: "US-029",
  length: "US-030",
  options: "US-008",
  ein: "BR-023",
} as const;

function isBlank(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export function isBlankRow(
  row: Record<string, string | number | null> | null | undefined,
  columns: Array<{ key: string }>,
): boolean {
  if (!row) return true;
  return columns.every((column) => {
    const cell = row[column.key];
    return cell === null || cell === undefined || String(cell).trim() === "";
  });
}

export function isVisible(question: Question, answers: Answers): boolean {
  if (!question.visibleWhen) return true;
  const current = answers[question.visibleWhen.key];
  return String(current ?? "") === question.visibleWhen.equals;
}

export function visibleAnswers(definition: FormDefinition, answers: Answers): Answers {
  const visible: Answers = {};
  for (const question of definition.sections.flatMap((section) => section.questions)) {
    if (question.key in answers && isVisible(question, answers)) visible[question.key] = answers[question.key];
  }
  return visible;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

function phrase(label: string): string {
  const clean = label.trim().replace(/[\s:.?]+$/, "");
  const [first, ...rest] = clean.split(" ");
  const keepCase = /[A-Z]/.test(first.slice(1)) || rest.some((word) => /^[A-Z]/.test(word));
  return keepCase ? clean : first.toLowerCase() + (rest.length ? ` ${rest.join(" ")}` : "");
}

export function requiredMessage(question: Pick<Question, "label" | "type">): string {
  const label = question.label.trim();
  const words = phrase(label);
  switch (question.type) {
    case "yesno":
      return `Answer Yes or No: ${label.endsWith("?") ? label : `${label}?`}`;
    case "select":
      return `Choose ${/^[aeiou]/i.test(words) ? "an" : "a"} ${words}.`;
    case "table":
      return `Fill in the ${words} table.`;
    case "integer":
    case "number":
      return /^(number|total|count|amount) /i.test(words) ? `Enter the ${words}.` : `Enter the number of ${words}.`;
    case "percent":
      return `Enter the ${words} as a percentage.`;
    case "currency":
      return `Enter the ${words} in dollars.`;
    default:
      return `Enter the ${words}.`;
  }
}

function checkType(question: Question, value: AnswerValue): string | null {
  const text = typeof value === "string" ? value.trim() : String(value);
  switch (question.type) {
    case "integer":
    case "number":
    case "currency":
    case "percent":
      return numericProblem(question.type, text, question.label);
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) &&
        !Number.isNaN(Date.parse(text)) &&
        new Date(text).toISOString().startsWith(text)
        ? null
        : `${question.label} must be a date.`;
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
        ? null
        : `${question.label} must be an email address, like name@example.org.`;
    case "phone":
      return /^\d{10}$/.test(text.replace(/\D/g, "")) ? null : `${question.label} must be a 10-digit phone number.`;
    case "ein":
      return /^\d{2}-?\d{7}$/.test(text) ? null : `${question.label} must be 9 digits, like 12-3456789.`;
    case "yesno":
      return ["Yes", "No"].includes(text) ? null : `Answer Yes or No: ${question.label.trim().replace(/[.?]*$/, "?")}`;
    default:
      return null;
  }
}

function questionIssues(question: Question, answers: Answers): Issue[] {
  const issues: Issue[] = [];
  const value = answers[question.key];
  const tableAnswered =
    question.type === "table" && Array.isArray(value) && value.some((row) => !isBlankRow(row, question.columns ?? []));
  if (isBlank(value) || (question.type === "table" && !tableAnswered)) {
    if (question.required) {
      issues.push({
        field: question.key,
        ruleId: RULES.required,
        severity: "block",
        message: requiredMessage(question),
      });
    }
    return issues;
  }

  if (question.type === "table") {
    const rows = Array.isArray(value) ? value : [];
    if (question.maxRows && rows.length > question.maxRows) {
      issues.push({
        field: question.key,
        ruleId: RULES.length,
        severity: "block",
        message: `${question.label} can have at most ${question.maxRows} rows.`,
      });
    }
    const columns = question.columns ?? [];
    rows.forEach((row, index) => {
      if (isBlankRow(row, columns)) return;
      const missing = columns.filter((column) => {
        const cell = row[column.key];
        return cell === null || cell === undefined || String(cell).trim() === "";
      });
      if (missing.length > 0) {
        issues.push({
          field: question.key,
          ruleId: RULES.required,
          severity: "block",
          message: `${question.label}, row ${index + 1}: fill in ${missing.map((column) => column.label).join(" and ")}, or remove the row.`,
        });
      }
      for (const column of columns) {
        if (column.type === "text") continue;
        const cell = row[column.key];
        if (cell === null || cell === undefined || String(cell).trim() === "") continue;
        const problem = numericProblem(column.type, String(cell), `${column.label} in row ${index + 1}`);
        if (problem) issues.push({ field: question.key, ruleId: RULES.type, severity: "block", message: problem });
      }
    });
    return issues;
  }

  if (question.type === "select" && question.options && !question.options.includes(String(value))) {
    issues.push({
      field: question.key,
      ruleId: RULES.options,
      severity: "block",
      message: `Choose one of the listed options for ${question.label}.`,
    });
    return issues;
  }

  const typeError = checkType(question, value as AnswerValue);
  if (typeError) {
    issues.push({
      field: question.key,
      ruleId: question.type === "ein" ? RULES.ein : RULES.type,
      severity: "block",
      message: typeError,
    });
    return issues;
  }

  const text = String(value);
  if (question.key === "contact_name") {
    const problem = personNameProblem(text, "contact name");
    if (problem) {
      issues.push({ field: question.key, ruleId: RULES.type, severity: "block", message: problem });
      return issues;
    }
  }
  if (question.maxLength && text.length > question.maxLength) {
    issues.push({
      field: question.key,
      ruleId: RULES.length,
      severity: "block",
      message: `${question.label} must be ${question.maxLength} characters or fewer (now ${text.length}).`,
    });
  }
  if (question.maxWords) {
    const words = wordCount(text);
    if (words > question.maxWords) {
      issues.push({
        field: question.key,
        ruleId: RULES.length,
        severity: "block",
        message: `${question.label} must be ${question.maxWords} words or fewer (now ${words}).`,
      });
    }
  }
  return issues;
}

export function budgetTotals(lines: BudgetLine[]) {
  const ps = sumAmounts(lines.filter((l) => l.category === "PS").map((l) => l.amount));
  const otps = sumAmounts(lines.filter((l) => l.category === "OTPS").map((l) => l.amount));
  return { ps, otps, total: sumAmounts([ps, otps]) };
}

export function balanceMessage(total: number, award: number): { balanced: boolean; message: string } {
  const diff = (toCents(total) - toCents(award)) / 100;
  if (diff === 0) return { balanced: true, message: `Balanced: total equals the award of ${formatCurrency(award)}.` };
  const direction = diff > 0 ? "over" : "under";
  return {
    balanced: false,
    message: `Total ${formatCurrency(total)} must equal award ${formatCurrency(award)} (${direction} by ${formatCurrency(Math.abs(diff))}).`,
  };
}

function budgetIssues(definition: FormDefinition, lines: BudgetLine[], award: number): Issue[] {
  if (!definition.budget.enabled) return [];
  const issues: Issue[] = [];
  if (lines.length === 0) {
    issues.push({
      field: "budget",
      ruleId: RULES.required,
      severity: "block",
      message: "Add at least one budget line.",
    });
    return issues;
  }
  if (lines.length > definition.budget.maxLines) {
    issues.push({
      field: "budget",
      ruleId: RULES.budgetLines,
      severity: "block",
      message: `The budget can have at most ${definition.budget.maxLines} lines. This budget has ${lines.length}.`,
    });
  }
  lines.forEach((line) => {
    if (line.description.trim() === "") {
      issues.push({
        field: `budget.${line.rowId}`,
        ruleId: RULES.required,
        severity: "block",
        message: `Line ${line.position}: enter a description.`,
      });
    }
    const problem = amountBoundsProblem(line.amount, `Line ${line.position}: the amount`);
    if (problem)
      issues.push({ field: `budget.${line.rowId}`, ruleId: RULES.type, severity: "block", message: problem });
    if (line.actual !== null && line.actual !== undefined) {
      const actualProblem = amountBoundsProblem(line.actual, `Line ${line.position}: actual spent`);
      if (actualProblem)
        issues.push({ field: `budget.${line.rowId}`, ruleId: RULES.type, severity: "block", message: actualProblem });
    }
  });
  if (definition.budget.mustEqualAward) {
    const { total } = budgetTotals(lines);
    const balance = balanceMessage(total, award);
    if (!balance.balanced) {
      issues.push({ field: "budget", ruleId: RULES.budgetBalance, severity: "block", message: balance.message });
    }
  }
  return issues;
}

export function validateSubmission(input: ValidationInput): Issue[] {
  const issues: Issue[] = [];
  for (const section of input.definition.sections) {
    if (section.kind !== "questions") continue;
    for (const question of section.questions) {
      if (!isVisible(question, input.answers)) continue;
      issues.push(...questionIssues(question, input.answers));
    }
  }
  issues.push(...sumIssues(input.definition, input.answers, input.awardAmount));
  issues.push(...budgetIssues(input.definition, input.budget, input.awardAmount));
  return issues;
}

export function blockingIssues(issues: Issue[]): Issue[] {
  return issues.filter((issue) => issue.severity === "block");
}
