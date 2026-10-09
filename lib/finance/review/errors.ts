import { pgCode } from "@/lib/db";

const MESSAGE_MAP: [RegExp, string][] = [
  [/resolve blocking flags/i, "Resolve the open budget, completeness and validation flags before accepting this report."],
  [/a note is required/i, "Add a note before sending. The organization needs to know what to change."],
  [/a reason is required/i, "Enter a reason. Every change is recorded with its reason."],
  [/corrections apply to submitted reports only/i, "Corrections can only be made to reports that have been submitted."],
  [/cannot (review|accept|request update|submit) from/i, "This report is no longer in a state where that action is allowed. Reload the page to see its current status."],
  [/only accepted reports can be reopened/i, "Only accepted reports can be reopened."],
];

export const STALE_MESSAGE = "Someone else changed this report. Reload to see their changes.";

export function plainError(error: unknown): string {
  const code = pgCode(error);
  const message = error instanceof Error ? error.message : "";
  if (code === "40001") return STALE_MESSAGE;
  if (code === "42501") return "Your role cannot do this. Only Finance analysts and administrators can review reports.";
  if (code === "23514" || code === "P0001") {
    const known = MESSAGE_MAP.find(([pattern]) => pattern.test(message));
    return known ? known[1] : "That change is not allowed for this report right now.";
  }
  if (code === "02000" || code === "P0002") return "That report could not be found.";
  return "Something went wrong and nothing was saved. Try again, and tell an administrator if it keeps happening.";
}
