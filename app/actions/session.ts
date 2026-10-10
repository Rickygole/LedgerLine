"use server";

import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { homeFor, type Role } from "@/lib/auth";
import { anonymous, withClaims } from "@/lib/db";
import { safeNext } from "@/lib/redirect";
import { allowed, blocked, clearAttempts, clientKey, TOO_MANY } from "@/lib/throttle";
import { GATE_COOKIE, SESSION_COOKIE, sessionCookieOptions, signGate, signSession, verifySessionClaims } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().min(1, "Enter your work email.").email("Enter a work email address in the right format, like name@example.org."),
  password: z.string().min(1, "Enter your password."),
});

const IP_FAILURE_LIMIT = 30;
const EMAIL_FAILURE_LIMIT = 8;

const DUMMY_HASH = "$2b$10$ub.I6pzHcfPjvdwuphNjf.D0PorzRHkVo7g34JoMBQE4O5FnPI8TO";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string> } | undefined;

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
  const rawEmail = String(formData.get("email") ?? "").slice(0, 254);
  const values = { email: rawEmail };
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors, values };
  }
  const ip = await clientKey();
  const email = parsed.data.email.toLowerCase();
  const ipKey = `login-ip:${ip}`;
  const emailKey = `login-email:${email}`;
  if ((await blocked(ipKey, IP_FAILURE_LIMIT)) || (await blocked(emailKey, EMAIL_FAILURE_LIMIT))) return { error: TOO_MANY, values };

  const account = await lookup(email);
  const valid = await bcrypt.compare(parsed.data.password, account?.password_hash ?? DUMMY_HASH);
  if (!account || !valid) {
    const ipOk = await allowed(ipKey, IP_FAILURE_LIMIT);
    const emailOk = await allowed(emailKey, EMAIL_FAILURE_LIMIT);
    if (!ipOk || !emailOk) return { error: TOO_MANY, values };
    return { error: "That email and password do not match an account.", values };
  }
  await clearAttempts(emailKey);

  const session = await withClaims(account.id, async (tx) => {
    const row = await tx.one<{ role: Role; version: number }>("SELECT role, app.current_session_version() AS version FROM app_user WHERE id = app.uid()");
    await tx.query("SELECT app.write_audit('user', $1, 'sign_in', NULL, NULL, NULL, NULL)", [account.id]);
    return row;
  });
  if (!session) return { error: "This account is not active.", values };
  const role = session.role;

  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(account.id, session.version), sessionCookieOptions);
  redirect(safeNext(formData.get("next"), homeFor(role)));
}

export async function signOut() {
  const store = await cookies();
  const claims = await verifySessionClaims(store.get(SESSION_COOKIE)?.value);
  if (claims) {
    await withClaims(claims.sub, (tx) => tx.query("SELECT app.revoke_session($1::uuid, $2::timestamptz)", [claims.jti, claims.expiresAt.toISOString()]));
  }
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
  const requested = safeNext(formData.get("next"), "/");
  const target = requested === "/" || /^\/[^/\\]/.test(requested) ? requested : "/";
  const needsSession = target.startsWith("/portal") || target.startsWith("/finance");
  if (needsSession && !(await verifySessionClaims(store.get(SESSION_COOKIE)?.value))) redirect(`/login?next=${encodeURIComponent(target)}`);
  redirect(target);
}
