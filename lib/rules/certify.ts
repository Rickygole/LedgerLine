import { personNameProblem } from "./person-name";
import type { Issue } from "./types";

export const CERTIFICATION_STATEMENT = "I certify this report is accurate and complete.";

const CERT_RULE = "LL-CERT";

type CertificationInput = {
  accepted: boolean;
  name: string;
  title: string;
};

export type Certification = {
  statement: string;
  name: string;
  title: string;
  certifiedAt: string;
};

export function certificationIssues(input: Partial<CertificationInput> | null | undefined): Issue[] {
  const issues: Issue[] = [];
  const name = (input?.name ?? "").trim();
  const title = (input?.title ?? "").trim();
  if (!input?.accepted) {
    issues.push({ field: "certification", ruleId: CERT_RULE, severity: "block", message: "Check the box to certify that this report is accurate and complete." });
  }
  if (name.length < 2) {
    issues.push({ field: "certifier_name", ruleId: CERT_RULE, severity: "block", message: "Enter the name of the person certifying this report." });
  } else if (name.length > 120) {
    issues.push({ field: "certifier_name", ruleId: CERT_RULE, severity: "block", message: "The certifier name must be 120 characters or fewer." });
  } else {
    const problem = personNameProblem(name, "certifier name");
    if (problem) issues.push({ field: "certifier_name", ruleId: CERT_RULE, severity: "block", message: problem });
  }
  if (title.length < 2) {
    issues.push({ field: "certifier_title", ruleId: CERT_RULE, severity: "block", message: "Enter the title of the person certifying this report." });
  } else if (title.length > 120) {
    issues.push({ field: "certifier_title", ruleId: CERT_RULE, severity: "block", message: "The certifier title must be 120 characters or fewer." });
  }
  return issues;
}

export function certificationNote(certification: Pick<Certification, "name" | "title">): string {
  return `Certified accurate and complete by ${certification.name}, ${certification.title}`;
}
