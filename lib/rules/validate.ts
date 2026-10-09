import { amountBoundsProblem, numericProblem } from "./bounds";
import { formatCurrency, sumAmounts, toCents } from "./money";
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

function checkType(question: Question, value: AnswerValue): string | null {
  const text = typeof value === "string" ? value.trim() : String(value);
  switch (question.type) {
    case "integer":
    case "number":
    case "currency":
    case "percent":
      return numericProblem(question.type, text, question.label);
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) && new Date(text).toISOString().startsWith(text) ? null : `${question.label} must be a date.`;
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? null : `${question.label} must be an email address, like name@example.org.`;
    case "phone":
      return /^\d{10}$/.test(text.replace(/\D/g, "")) ? null : `${question.label} must be a 10-digit phone number.`;
    case "ein":
      return /^\d{2}-?\d{7}$/.test(text) ? null : `${question.label} must be 9 digits, like 12-3456789.`;
    case "yesno":
      return ["Yes", "No"].includes(text) ? null : `Choose Yes or No for ${question.label}.`;
    default:
      return null;
  }
}

function questionIssues(question: Question, answers: Answers): Issue[] {
  const issues: Issue[] = [];
  const value = answers[question.key];
  if (isBlank(value)) {
    if (question.required) {
      issues.push({ field: question.key, ruleId: RULES.required, severity: "block", message: `Enter ${question.label.toLowerCase()}.` });
    }
    return issues;
  }

  if (question.type === "table") {
    const rows = Array.isArray(value) ? value : [];
    if (question.maxRows && rows.length > question.maxRows) {
      issues.push({ field: question.key, ruleId: RULES.length, severity: "block", message: `${question.label} can have at most ${question.maxRows} rows.` });
    }
    rows.forEach((row, index) => {
      for (const column of question.columns ?? []) {
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
    issues.push({ field: question.key, ruleId: RULES.options, severity: "block", message: `Choose one of the listed options for ${question.label}.` });
    return issues;
  }

  const typeError = checkType(question, value as AnswerValue);
  if (typeError) {
    issues.push({ field: question.key, ruleId: question.type === "ein" ? RULES.ein : RULES.type, severity: "block", message: typeError });
    return issues;
  }

  const text = String(value);
  if (question.maxLength && text.length > question.maxLength) {
    issues.push({ field: question.key, ruleId: RULES.length, severity: "block", message: `${question.label} must be ${question.maxLength} characters or fewer (now ${text.length}).` });
  }
  if (question.maxWords) {
    const words = wordCount(text);
    if (words > question.maxWords) {
      issues.push({ field: question.key, ruleId: RULES.length, severity: "block", message: `${question.label} must be ${question.maxWords} words or fewer (now ${words}).` });
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
    issues.push({ field: "budget", ruleId: RULES.required, severity: "block", message: "Add at least one budget line." });
    return issues;
  }
  if (lines.length > definition.budget.maxLines) {
    issues.push({ field: "budget", ruleId: RULES.budgetLines, severity: "block", message: `The budget can have at most ${definition.budget.maxLines} lines. This budget has ${lines.length}.` });
  }
  lines.forEach((line) => {
    if (line.description.trim() === "") {
      issues.push({ field: `budget.${line.rowId}`, ruleId: RULES.required, severity: "block", message: `Line ${line.position}: enter a description.` });
    }
    const problem = amountBoundsProblem(line.amount, `Line ${line.position}: the amount`);
    if (problem) issues.push({ field: `budget.${line.rowId}`, ruleId: RULES.type, severity: "block", message: problem });
    if (line.actual !== null && line.actual !== undefined) {
      const actualProblem = amountBoundsProblem(line.actual, `Line ${line.position}: actual spent`);
      if (actualProblem) issues.push({ field: `budget.${line.rowId}`, ruleId: RULES.type, severity: "block", message: actualProblem });
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
  issues.push(...budgetIssues(input.definition, input.budget, input.awardAmount));
  return issues;
}

export function blockingIssues(issues: Issue[]): Issue[] {
  return issues.filter((issue) => issue.severity === "block");
}
