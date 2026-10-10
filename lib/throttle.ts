import "server-only";
import { headers } from "next/headers";
import { anonymous } from "@/lib/db";

export const TOO_MANY = "Too many attempts. Wait 15 minutes and try again.";

export async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "local").split(",")[0].trim();
}

export async function allowed(key: string, limit: number): Promise<boolean> {
  const rows = await anonymous<{ ok: boolean }>("SELECT app.record_attempt($1, 15, $2) AS ok", [key, limit]);
  return rows[0]?.ok === true;
}

export async function allowedWithin(key: string, minutes: number, limit: number): Promise<boolean> {
  const rows = await anonymous<{ ok: boolean }>("SELECT app.record_attempt($1, $2, $3) AS ok", [key, minutes, limit]);
  return rows[0]?.ok === true;
}

export async function blocked(key: string, limit: number): Promise<boolean> {
  const rows = await anonymous<{ blocked: boolean }>("SELECT app.attempts_blocked($1, 15, $2) AS blocked", [
    key,
    limit,
  ]);
  return rows[0]?.blocked === true;
}

export async function clearAttempts(key: string): Promise<void> {
  await anonymous("SELECT app.clear_attempts($1)", [key]);
}
