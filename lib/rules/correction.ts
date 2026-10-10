import { blockingIssues, validateSubmission } from "./validate";
import type { Answers, Issue, ValidationInput } from "./types";

export function introducedBlockingIssues(input: ValidationInput, key: string, value: string): Issue[] {
  const before = blockingIssues(validateSubmission(input));
  const after = blockingIssues(
    validateSubmission({ ...input, answers: { ...input.answers, [key]: value } as Answers }),
  );
  return after.filter((issue) => !before.some((old) => old.field === issue.field && old.ruleId === issue.ruleId));
}
