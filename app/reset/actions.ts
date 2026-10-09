"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { anonymous, pgCode } from "@/lib/db";
import { hashToken, isTokenFormat, passwordProblem } from "@/lib/password";
import { allowed, clientKey, TOO_MANY } from "@/lib/throttle";
import type { FormState } from "@/app/actions/session";

const INVALID = "This link has expired or was already used. Ask Council Finance to send a new one.";

export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!isTokenFormat(token)) return { error: INVALID };
  const hash = hashToken(token);
  const ip = await clientKey();
  if (!(await allowed(`reset-ip:${ip}`, 30)) || !(await allowed(`reset-token:${hash}`, 8))) return { error: TOO_MANY };

  const info = await anonymous<{ email: string }>("SELECT email FROM app.password_token_info($1)", [hash]);
  if (!info[0]) return { error: INVALID };
  const problem = passwordProblem(password, confirm, info[0].email);
  if (problem) return { fieldErrors: { password: problem } };

  try {
    await anonymous("SELECT app.reset_password($1, $2)", [hash, await bcrypt.hash(password, 10)]);
  } catch (error) {
    if (pgCode(error) === "23514") return { error: INVALID };
    throw error;
  }
  redirect("/login?reset=1");
}
