import { formatCurrency, toCents } from "./money";
import type { Answers, BudgetLine, Issue } from "./types";

export const VARIANCE_NOTE_KEY = "budget_variance_note";
export const VARIANCE_THRESHOLD_PERCENT = 10;
const VARIANCE_NOTE_MIN = 10;
export const VARIANCE_NOTE_MAX = 1000;

const SPEND_RULES = {
  variance: "LL-VARIANCE",
  actual: "LL-ACTUAL",
} as const;

type SpendSummary = {
  entered: boolean;
  approved: number;
  actual: number;
  variance: number;
  unspent: number;
  unspentPercent: number;
};

function hasActual(line: BudgetLine): boolean {
  return line.actual !== null && line.actual !== undefined;
}

export function lineVariance(line: BudgetLine): number | null {
  if (!hasActual(line)) return null;
  return (toCents(line.amount) - toCents(line.actual as number)) / 100;
}

export function spendSummary(lines: BudgetLine[], award: number): SpendSummary {
  const approvedCents = lines.reduce((sum, line) => sum + toCents(line.amount), 0);
  const actualCents = lines.reduce((sum, line) => sum + (hasActual(line) ? toCents(line.actual as number) : 0), 0);
  const unspentCents = toCents(award) - actualCents;
  return {
    entered: lines.some(hasActual),
    approved: approvedCents / 100,
    actual: actualCents / 100,
    variance: (approvedCents - actualCents) / 100,
    unspent: unspentCents / 100,
    unspentPercent: award > 0 ? Math.round((unspentCents / toCents(award)) * 10000) / 100 : 0,
  };
}

function overThreshold(lines: BudgetLine[], award: number): boolean {
  const summary = spendSummary(lines, award);
  if (!summary.entered || award <= 0) return false;
  return toCents(summary.unspent) * 100 > toCents(award) * VARIANCE_THRESHOLD_PERCENT;
}

export function needsVarianceNote(lines: BudgetLine[], award: number): boolean {
  return overThreshold(lines, award);
}

export function spendIssues(input: { lines: BudgetLine[]; award: number; answers: Answers; phase: "edit" | "submit" }): Issue[] {
  const { lines, award, answers, phase } = input;
  if (lines.length === 0) return [];
  const issues: Issue[] = [];
  const summary = spendSummary(lines, award);

  if (!summary.entered) {
    issues.push({ field: "budget", ruleId: SPEND_RULES.actual, severity: "warn", message: "Actual spent has not been entered. Add what was actually spent on each line, or leave a line blank if nothing was spent." });
    return issues;
  }

  lines.forEach((line) => {
    if (hasActual(line) && toCents(line.actual as number) > toCents(line.amount)) {
      issues.push({ field: `budget.${line.rowId}`, ruleId: SPEND_RULES.actual, severity: "warn", message: `Line ${line.position}: actual spent is more than the approved amount.` });
    }
  });
  if (toCents(summary.actual) > toCents(award)) {
    issues.push({ field: "budget", ruleId: SPEND_RULES.actual, severity: "warn", message: `Actual spent ${formatCurrency(summary.actual)} is more than the award ${formatCurrency(award)}.` });
  }

  if (overThreshold(lines, award)) {
    const note = answers[VARIANCE_NOTE_KEY];
    const text = typeof note === "string" ? note.trim() : "";
    if (text.length < VARIANCE_NOTE_MIN) {
      issues.push({
        field: VARIANCE_NOTE_KEY,
        ruleId: SPEND_RULES.variance,
        severity: phase === "submit" ? "block" : "warn",
        message: `${summary.unspentPercent.toFixed(1)}% of the award is unspent. Explain why in the variance explanation.`,
      });
    } else if (text.length > VARIANCE_NOTE_MAX) {
      issues.push({ field: VARIANCE_NOTE_KEY, ruleId: SPEND_RULES.variance, severity: "block", message: `The variance explanation must be ${VARIANCE_NOTE_MAX} characters or fewer.` });
    }
  }
  return issues;
}
