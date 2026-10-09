import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ll_session";
export const GATE_COOKIE = "ll_gate";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function key(name: "AUTH_SECRET" | "GATE_COOKIE_SECRET"): Uint8Array {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must be at least 32 characters`);
  return new TextEncoder().encode(value);
}

export async function signSession(sub: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setIssuer("ledgerline")
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key("AUTH_SECRET"));
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key("AUTH_SECRET"), { issuer: "ledgerline" });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function signGate(): Promise<string> {
  return new SignJWT({ gate: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key("GATE_COOKIE_SECRET"));
}

export async function verifyGate(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key("GATE_COOKIE_SECRET"));
    return payload.gate === true;
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
