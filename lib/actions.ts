import { z } from "zod";
import { nowMs } from "@/lib/dates";
import { pgCode } from "@/lib/db";
import { formatCount } from "@/lib/format";
import { logError } from "@/lib/ops/log";

export type ActionState =
  | {
      ok?: string;
      error?: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
      link?: string;
      at?: number;
    }
  | undefined;

export type ActionResult = NonNullable<ActionState>;

type Extra = Pick<ActionResult, "fieldErrors" | "values" | "link">;

export function success(message: string, extra: Extra = {}): ActionResult {
  return { ...extra, ok: message, at: nowMs() };
}

export function failure(message: string, extra: Extra = {}): ActionResult {
  return { ...extra, error: message, at: nowMs() };
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export function allIssues(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.message))].join(" ");
}

export type ErrorOverrides = {
  messages?: Record<string, string> | readonly (readonly [RegExp, string])[];
  codes?: Record<string, string>;
  fallback?: string;
};

const BY_CODE: Record<string, string> = {
  "42501": "Your role does not allow this action. Ask a Finance administrator for help.",
  "40001": "Someone else changed this record first. Reload the page and try again.",
  "23514": "That change is not allowed for the record in its current state.",
  "23505": "A record with those details already exists.",
  "23503": "A related record could not be found. Reload the page and try again.",
  "22P02": "One of the values is not in a valid format.",
  "22003": "One of the numbers is too large. Check the amounts and try again.",
  "22001": "One of the values is too long. Shorten it and try again.",
  "22007": "One of the dates is not a real calendar date.",
  "22008": "One of the dates is not a real calendar date.",
  "23502": "A required value is missing. Fill in every required field.",
  P0001: "That could not be saved.",
};

const FALLBACK = "Something went wrong and nothing was saved. Try again, and contact support if it keeps happening.";

function matchMessage(message: string, messages: ErrorOverrides["messages"]): string | null {
  if (!messages) return null;
  if (Array.isArray(messages)) return messages.find(([pattern]) => pattern.test(message))?.[1] ?? null;
  const known = Object.entries(messages as Record<string, string>).find(([needle]) => message.includes(needle));
  return known ? known[1] : null;
}

export function dbErrorMessage(error: unknown, overrides: ErrorOverrides = {}): string {
  const message = error instanceof Error ? error.message : "";
  const hit = matchMessage(message, overrides.messages);
  if (hit) return hit;
  const code = pgCode(error);
  if (!code) return overrides.fallback ?? FALLBACK;
  if (overrides.codes?.[code]) return overrides.codes[code];
  if (code === "23505" && (error as { constraint?: string }).constraint === "initiative_name_year_idx") {
    return "An initiative with that name already exists in this fiscal year. Choose a different name.";
  }
  return BY_CODE[code] ?? overrides.fallback ?? FALLBACK;
}

export async function actionFailure(
  event: string,
  error: unknown,
  overrides: ErrorOverrides = {},
  extra: Extra = {},
): Promise<ActionResult> {
  await logError(event, error);
  return failure(dbErrorMessage(error, overrides), extra);
}

export const trimmed = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `Use ${formatCount(max)} characters or fewer for ${label}.`);

export const isoDay = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter ${label} as a date.`);
