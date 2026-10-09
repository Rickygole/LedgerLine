"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { homeFor, type Role } from "@/lib/auth";
import { anonymous, withClaims } from "@/lib/db";
import { GATE_COOKIE, SESSION_COOKIE, sessionCookieOptions, signGate, signSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

async function lookup(email: string): Promise<{ id: string; password_hash: string } | null> {
  const rows = await anonymous<{ id: string; password_hash: string }>("SELECT * FROM app.login_lookup($1)", [email]);
  return rows[0] ?? null;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors };
  }
  const account = await lookup(parsed.data.email);
  const valid = account ? await bcrypt.compare(parsed.data.password, account.password_hash) : false;
  if (!account || !valid) return { error: "That email and password do not match an account." };

  const role = await withClaims(account.id, async (tx) => {
    const row = await tx.one<{ role: Role }>("SELECT role FROM app_user WHERE id = app.uid()");
    await tx.query("SELECT app.write_audit('user', $1, 'sign_in', NULL, NULL, NULL, NULL)", [account.id]);
    return row?.role;
  });
  if (!role) return { error: "This account is not active." };

  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(account.id), sessionCookieOptions);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : homeFor(role));
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function unlockGate(_prev: FormState, formData: FormData): Promise<FormState> {
  const passcode = String(formData.get("passcode") ?? "");
  const expected = process.env.GATE_PASSCODE;
  if (!expected || passcode.trim() !== expected) return { error: "That passcode is not correct." };
  const store = await cookies();
  store.set(GATE_COOKIE, await signGate(), { ...sessionCookieOptions, maxAge: 60 * 60 * 24 * 7 });
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/login");
}
