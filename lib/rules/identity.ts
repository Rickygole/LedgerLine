import type { Answers, FormDefinition } from "./types";

export const EIN_NOT_ON_LIST = "This EIN is not on the Council master list for this organization.";
export const NAME_NOT_ON_LIST = "This legal name does not match the Council master list for this organization.";

type MasterOrg = { legalName: string; ein: string };

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatEin(value: string): string {
  const text = value.trim();
  const digits = digitsOnly(text);
  return digits.length === 9 && /^[\d\s-]+$/.test(text) ? `${digits.slice(0, 2)}-${digits.slice(2)}` : text;
}

export function normalizeEinAnswers(definition: FormDefinition, answers: Answers): Answers {
  const next: Answers = { ...answers };
  for (const question of definition.sections.flatMap((section) => section.questions)) {
    const value = next[question.key];
    if (question.type === "ein" && typeof value === "string") next[question.key] = formatEin(value);
  }
  return next;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function einMismatch(entered: unknown, orgEin: string | null): boolean {
  if (orgEin === null || typeof entered !== "string") return false;
  const digits = digitsOnly(entered);
  if (digits.length !== 9) return false;
  return digits !== digitsOnly(orgEin);
}

export function nameMismatch(entered: unknown, orgName: string | null): boolean {
  if (orgName === null || typeof entered !== "string") return false;
  if (entered.trim() === "") return false;
  return normalizeName(entered) !== normalizeName(orgName);
}

export function identityProblem(key: string, value: unknown, org: MasterOrg): string | null {
  if (key === "org_ein") return einMismatch(value, org.ein) ? EIN_NOT_ON_LIST : null;
  if (key === "org_legal_name") return nameMismatch(value, org.legalName) ? NAME_NOT_ON_LIST : null;
  return null;
}
