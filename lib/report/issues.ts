import { RULES, isVisible, validateSubmission } from "@/lib/rules/validate";
import type { FormDefinition, Issue, ValidationInput } from "@/lib/rules/types";

export const EIN_NOT_ON_LIST = "This EIN is not on the Council master list for your organization.";

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function einMismatch(entered: unknown, orgEin: string | null): boolean {
  if (orgEin === null || typeof entered !== "string") return false;
  const digits = digitsOnly(entered);
  if (digits.length !== 9) return false;
  return digits !== digitsOnly(orgEin);
}

export function reportIssues(input: ValidationInput & { orgEin: string | null }): Issue[] {
  const issues = validateSubmission(input);
  for (const section of input.definition.sections) {
    for (const question of section.questions) {
      if (question.type !== "ein" || question.key !== "org_ein") continue;
      if (!isVisible(question, input.answers)) continue;
      if (einMismatch(input.answers[question.key], input.orgEin)) {
        issues.push({ field: question.key, ruleId: RULES.ein, severity: "block", message: EIN_NOT_ON_LIST });
      }
    }
  }
  return issues;
}

export function sectionKeyForField(definition: FormDefinition, field: string): string | null {
  if (field === "budget" || field.startsWith("budget.")) {
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
  if (field === "budget" || field.startsWith("budget.")) return "budget-grid";
  return `q-${field}`;
}
