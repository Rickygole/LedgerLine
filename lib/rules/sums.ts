import { formatCount, formatCurrency } from "@/lib/format";
import { isBlankRow, isVisible } from "./validate";
import { toCents } from "./money";
import type { Answers, FormDefinition, Issue, Question, SumTarget } from "./types";

export const SUM_RULE_ID = "US-027";

export const SUMMABLE_TYPES = ["number", "integer", "currency", "percent"] as const;

type Summable = (typeof SUMMABLE_TYPES)[number];

export function isSummable(type: string): type is Summable {
  return (SUMMABLE_TYPES as readonly string[]).includes(type);
}

export function numberOf(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw)
    .trim()
    .replace(/[$,%\s]/g, "");
  if (text === "" || !/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  return Number(text);
}

function show(type: string, value: number): string {
  if (type === "currency") return formatCurrency(value, { cents: true });
  if (type === "percent") return `${formatCount(value)}%`;
  return formatCount(value);
}

export function targetText(type: string, target: SumTarget): string {
  return target === "award" ? "the award" : show(type, target);
}

function resolve(target: SumTarget, award: number): number {
  return target === "award" ? award : target;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function differenceText(type: string, total: number, goal: number): string {
  const diff = (toCents(total) - toCents(goal)) / 100;
  return `${show(type, Math.abs(diff))} ${diff > 0 ? "over" : "under"}`;
}

function tableIssue(question: Question, answers: Answers, award: number): Issue | null {
  const rule = question.sumRule;
  if (!rule || question.type !== "table") return null;
  const column = (question.columns ?? []).find((candidate) => candidate.key === rule.column);
  if (!column || !isSummable(column.type)) return null;
  const value = answers[question.key];
  const rows = Array.isArray(value) ? value : [];
  const columns = question.columns ?? [];
  const filled = rows.filter((row) => !isBlankRow(row, columns));
  if (filled.length === 0) return null;
  const total = filled.reduce((sum, row) => sum + toCents(numberOf(row[column.key]) ?? 0), 0) / 100;
  const goal = resolve(rule.target, award);
  if (toCents(total) === toCents(goal)) return null;
  return {
    field: question.key,
    ruleId: SUM_RULE_ID,
    severity: "block",
    message: `${question.label}: the ${column.label} column adds up to ${show(column.type, total)}, but it must add up to ${targetText(column.type, rule.target)}${rule.target === "award" ? ` of ${show(column.type, goal)}` : ""} (${differenceText(column.type, total, goal)}).`,
  };
}

export function sumIssues(definition: FormDefinition, answers: Answers, award: number): Issue[] {
  const issues: Issue[] = [];
  const questions = definition.sections.flatMap((section) => section.questions);
  for (const question of questions) {
    if (!isVisible(question, answers)) continue;
    const issue = tableIssue(question, answers, award);
    if (issue) issues.push(issue);
  }
  for (const rule of definition.sumRules ?? []) {
    const members = rule.fields
      .map((key) => questions.find((question) => question.key === key))
      .filter((question): question is Question => Boolean(question) && isVisible(question as Question, answers));
    if (members.length === 0) continue;
    const entered = members.map((question) => numberOf(answers[question.key]));
    if (entered.every((value) => value === null)) continue;
    const type = members[0].type;
    const total = entered.reduce<number>((sum, value) => sum + toCents(value ?? 0), 0) / 100;
    const goal = resolve(rule.target, award);
    if (toCents(total) === toCents(goal)) continue;
    issues.push({
      field: members[0].key,
      ruleId: SUM_RULE_ID,
      severity: "block",
      message: `${listNames(members.map((question) => question.label))} must add up to ${targetText(type, rule.target)}${rule.target === "award" ? ` of ${show(type, goal)}` : ""}. They add up to ${show(type, total)} (${differenceText(type, total, goal)}).`,
    });
  }
  return issues;
}
