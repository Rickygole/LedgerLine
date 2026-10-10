import type { ErrorOverrides } from "@/lib/actions";

export const STALE_MESSAGE = "Someone else changed this report. Reload to see their changes.";

const NOT_ALLOWED = "That change is not allowed for this report right now.";

export const REVIEW_ERRORS: ErrorOverrides = {
  messages: [
    [
      /resolve blocking flags/i,
      "Resolve the open budget, completeness and validation flags before accepting this report.",
    ],
    [/a note is required/i, "Add a note before sending. The organization needs to know what to change."],
    [/a reason is required/i, "Enter a reason. Every change is recorded with its reason."],
    [
      /corrections apply to submitted reports only/i,
      "Corrections can only be made to reports that have been submitted.",
    ],
    [
      /cannot (review|accept|request update|submit) from/i,
      "This report is no longer in a state where that action is allowed. Reload the page to see its current status.",
    ],
    [/only accepted reports can be reopened/i, "Only accepted reports can be reopened."],
  ],
  codes: {
    "40001": STALE_MESSAGE,
    "42501": "Your role cannot do this. Only Finance analysts and administrators can review reports.",
    "23514": NOT_ALLOWED,
    P0001: NOT_ALLOWED,
    "02000": "That report could not be found.",
    P0002: "That report could not be found.",
  },
  fallback: "Something went wrong and nothing was saved. Try again, and tell an administrator if it keeps happening.",
};
