import { blockingIssues, validateSubmission } from "./validate";
import type { Answers, BudgetLine, Issue, ValidationInput } from "./types";

export type Correction = { answers?: Answers; budget?: BudgetLine[] };

export function introducedBlockingIssuesFor(input: ValidationInput, change: Correction): Issue[] {
  const before = blockingIssues(validateSubmission(input));
  const after = blockingIssues(
    validateSubmission({
      ...input,
      answers: { ...input.answers, ...change.answers } as Answers,
      budget: change.budget ?? input.budget,
    }),
  );
  return after.filter((issue) => !before.some((old) => old.field === issue.field && old.ruleId === issue.ruleId));
}

export function introducedBlockingIssues(input: ValidationInput, key: string, value: string): Issue[] {
  return introducedBlockingIssuesFor(input, { answers: { [key]: value } });
}
