import { nowMs } from "@/lib/dates";
import { z } from "zod";
import { pgCode } from "@/lib/db";
import { plainError } from "@/lib/finance/admin/errors";
import { formatCount } from "@/lib/format";

export type OpState = { ok?: string; error?: string; at?: number } | undefined;

export function failure(message: string): OpState {
  return { error: message, at: nowMs() };
}

export function success(message: string): OpState {
  return { ok: message, at: nowMs() };
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export function dbFailure(error: unknown, friendly: Record<string, string> = {}): OpState {
  const message = error instanceof Error ? error.message : "";
  for (const [needle, text] of Object.entries(friendly)) if (message.includes(needle)) return failure(text);
  if (pgCode(error) === "P0001") return failure("That could not be saved.");
  return failure(plainError(error));
}

export const trimmed = (label: string, max: number) =>
  z.string().trim().min(1, `Enter ${label}.`).max(max, `Use ${formatCount(max)} characters or fewer for ${label}.`);

export const isoDay = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `Enter ${label} as a date.`);
