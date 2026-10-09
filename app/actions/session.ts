"use server";

import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { homeFor, type Role } from "@/lib/auth";
import { anonymous, withClaims } from "@/lib/db";
import { safeNext } from "@/lib/redirect";
import { GATE_COOKIE, SESSION_COOKIE, sessionCookieOptions, signGate, signSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

const DUMMY_HASH = "$2b$10$ub.I6pzHcfPjvdwuphNjf.D0PorzRHkVo7g34JoMBQE4O5FnPI8TO";
const TOO_MANY = "Too many attempts. Wait 15 minutes and try again.";

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

async function clientKey(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "local").split(",")[0].trim();
}

async function allowed(key: string, limit: number): Promise<boolean> {
  const rows = await anonymous<{ ok: boolean }>("SELECT app.record_attempt($1, 15, $2) AS ok", [key, limit]);
  return rows[0]?.ok === true;
}

async function lookup(email: string): Promise<{ id: string; password_hash: string } | null> {
  const rows = await anonymous<{ id: string; password_hash: string }>("SELECT * FROM app.login_lookup($1)", [email]);
  return rows[0] ?? null;
}

function sameSecret(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }
  const ip = await clientKey();
  const email = parsed.data.email.toLowerCase();
  if (!(await allowed(`login-ip:${ip}`, 30)) || !(await allowed(`login-email:${email}`, 8))) return { error: TOO_MANY };

  const account = await lookup(email);
  const valid = await bcrypt.compare(parsed.data.password, account?.password_hash ?? DUMMY_HASH);
  if (!account || !valid) return { error: "That email and password do not match an account." };

  const role = await withClaims(account.id, async (tx) => {
    const row = await tx.one<{ role: Role }>("SELECT role FROM app_user WHERE id = app.uid()");
    await tx.query("SELECT app.write_audit('user', $1, 'sign_in', NULL, NULL, NULL, NULL)", [account.id]);
    return row?.role;
  });
  if (!role) return { error: "This account is not active." };

  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(account.id), sessionCookieOptions);
  redirect(safeNext(formData.get("next"), homeFor(role)));
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function unlockGate(_prev: FormState, formData: FormData): Promise<FormState> {
  const ip = await clientKey();
  if (!(await allowed(`gate:${ip}`, 20))) return { error: TOO_MANY };
  const passcode = String(formData.get("passcode") ?? "").trim();
  const expected = (process.env.GATE_PASSCODE ?? "").trim();
  if (!expected || !sameSecret(passcode, expected)) return { error: "That passcode is not correct." };
  const store = await cookies();
  store.set(GATE_COOKIE, await signGate(), { ...sessionCookieOptions, maxAge: 60 * 60 * 24 * 7 });
  redirect(safeNext(formData.get("next"), "/login"));
}
