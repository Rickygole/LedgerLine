import { RULES, isVisible, validateSubmission } from "@/lib/rules/validate";
import { EIN_NOT_ON_LIST, digitsOnly, einMismatch, identityProblem } from "@/lib/rules/identity";
import { rangeIssues, type PeriodSpan } from "@/lib/rules/ranges";
import { VARIANCE_NOTE_KEY, spendIssues } from "@/lib/rules/spend";
import type { FormDefinition, Issue, ValidationInput } from "@/lib/rules/types";

export { EIN_NOT_ON_LIST, digitsOnly, einMismatch };

type ReportIssueInput = ValidationInput & {
  orgEin: string | null;
  orgName?: string | null;
  period?: PeriodSpan;
  phase?: "edit" | "submit";
};

export function reportIssues(input: ReportIssueInput): Issue[] {
  const issues = validateSubmission(input);
  for (const section of input.definition.sections) {
    for (const question of section.questions) {
      if (question.key !== "org_ein" && question.key !== "org_legal_name") continue;
      if (!isVisible(question, input.answers)) continue;
      const master = { ein: input.orgEin ?? "", legalName: input.orgName ?? "" };
      if (question.key === "org_ein" && input.orgEin === null) continue;
      if (question.key === "org_legal_name" && !input.orgName) continue;
      const problem = identityProblem(question.key, input.answers[question.key], master);
      if (problem) issues.push({ field: question.key, ruleId: RULES.ein, severity: "block", message: problem });
    }
  }
  if (input.definition.budget.enabled) {
    issues.push(...spendIssues({ lines: input.budget, award: input.awardAmount, answers: input.answers, phase: input.phase ?? "submit" }));
  }
  issues.push(...rangeIssues({ definition: input.definition, answers: input.answers, period: input.period }));
  return issues;
}

export function sectionKeyForField(definition: FormDefinition, field: string): string | null {
  if (field === "budget" || field === VARIANCE_NOTE_KEY || field.startsWith("budget.")) {
    return definition.sections.find((section) => section.kind === "budget")?.key ?? null;
  }
  for (const section of definition.sections) {
    if (section.questions.some((question) => question.key === field)) return section.key;
  }
  return null;
}

export function issuesBySection(definition: FormDefinition, issues: Issue[]): Record<string, Issue[]> {
  const result: Record<string, Issue[]> = {};
  for (const issue of issues) {
    const key = sectionKeyForField(definition, issue.field);
    if (!key) continue;
    (result[key] ??= []).push(issue);
  }
  return result;
}

export function fieldTargetId(field: string): string {
  if (field === VARIANCE_NOTE_KEY) return "budget-variance-note";
  if (field === "certification") return "certification-box";
  if (field === "certifier_name") return "certifier-name";
  if (field === "certifier_title") return "certifier-title";
  if (field === "budget" || field.startsWith("budget.")) return "budget-grid";
  return `q-${field}`;
}
