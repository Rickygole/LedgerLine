import { pgCode } from "@/lib/db";

export function ruleViolation(error: unknown): string | null {
  const code = pgCode(error);
  if (code !== "23514" && code !== "23505") return null;
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message || /violates|duplicate key/.test(message)) return null;
  return `${message.charAt(0).toUpperCase()}${message.slice(1)}${/[.?!]$/.test(message) ? "" : "."}`;
}
