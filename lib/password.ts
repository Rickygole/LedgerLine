import { createHash } from "node:crypto";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;

const TOKEN_FORMAT = /^[0-9a-f]{64}$/;

export function isTokenFormat(value: string): boolean {
  return TOKEN_FORMAT.test(value);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function passwordProblem(password: string, confirm: string, email: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES)
    return `Use ${MAX_PASSWORD_BYTES} bytes or fewer. Long passphrases with accented characters count extra.`;
  if (password.trim().toLowerCase() === email.trim().toLowerCase())
    return "The password cannot be the same as your email address.";
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}
