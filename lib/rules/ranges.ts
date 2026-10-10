import type { Answers, FormDefinition, Issue } from "./types";
import { formatCount } from "@/lib/format";

const RANGE_RULES = {
  days: "LL-RANGE-DAYS",
  subcount: "LL-RANGE-SUBCOUNT",
  served: "LL-RANGE-SERVED",
  pair: "LL-RANGE-PAIR",
} as const;

export type PeriodSpan = { startsOn: string; endsOn: string };

export function daysInPeriod(period: PeriodSpan): number {
  const from = Date.UTC(Number(period.startsOn.slice(0, 4)), Number(period.startsOn.slice(5, 7)) - 1, Number(period.startsOn.slice(8, 10)));
  const to = Date.UTC(Number(period.endsOn.slice(0, 4)), Number(period.endsOn.slice(5, 7)) - 1, Number(period.endsOn.slice(8, 10)));
  return Math.round((to - from) / 86_400_000) + 1;
}

function count(answers: Answers, key: string): number | null {
  const value = answers[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/,/g, "");
  if (!/^\d+$/.test(text)) return null;
  return Number(text);
}

const PAIRS: { part: string; whole: string; partLabel: string; wholeLabel: string }[] = [
  { part: "cases_resolved", whole: "cases_opened", partLabel: "Cases resolved", wholeLabel: "cases opened" },
  { part: "evictions_prevented", whole: "households_assisted", partLabel: "Evictions prevented", wholeLabel: "households assisted" },
  { part: "referrals_made", whole: "screenings_completed", partLabel: "Referrals to care", wholeLabel: "health screenings completed" },
];

export function rangeIssues(input: { definition: FormDefinition; answers: Answers; period?: PeriodSpan }): Issue[] {
  const { definition, answers, period } = input;
  const issues: Issue[] = [];
  const questions = definition.sections.flatMap((section) => section.questions);
  const has = (key: string) => questions.some((question) => question.key === key);

  if (period) {
    const days = daysInPeriod(period);
    for (const question of questions) {
      if (question.type !== "integer" || !question.key.endsWith("_days")) continue;
      const value = count(answers, question.key);
      if (value !== null && value > days) {
        issues.push({ field: question.key, ruleId: RANGE_RULES.days, severity: "block", message: `${question.label} cannot be more than the ${days} days in this reporting period.` });
      }
    }
  }

  const served = count(answers, "participants_actual");
  const target = count(answers, "participants_target");
  if (served !== null && target !== null && target > 0 && served > target * 2) {
    issues.push({ field: "participants_actual", ruleId: RANGE_RULES.served, severity: "warn", message: `Participants served (${formatCount(served)}) is more than twice the number targeted (${formatCount(target)}). Check both numbers.` });
  }

  const breakdown = answers.youth_breakdown;
  if (has("youth_breakdown") && answers.served_youth === "Yes" && Array.isArray(breakdown) && served !== null) {
    const total = breakdown.reduce((sum, row) => {
      const cell = String(row.count ?? "").trim().replace(/,/g, "");
      return /^\d+$/.test(cell) ? sum + Number(cell) : sum;
    }, 0);
    if (total > served) {
      issues.push({
        field: "youth_breakdown",
        ruleId: RANGE_RULES.subcount,
        severity: "block",
        message: `Participants under 18 add up to ${formatCount(total)}, which is more than the ${formatCount(served)} participants served.`,
      });
    }
  }

  for (const pair of PAIRS) {
    if (!has(pair.part) || !has(pair.whole)) continue;
    const part = count(answers, pair.part);
    const whole = count(answers, pair.whole);
    if (part !== null && whole !== null && part > whole) {
      issues.push({ field: pair.part, ruleId: RANGE_RULES.pair, severity: "warn", message: `${pair.partLabel} (${formatCount(part)}) is more than ${pair.wholeLabel} (${formatCount(whole)}). Check both numbers.` });
    }
  }
  return issues;
}
