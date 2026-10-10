export type EmailEnv = Record<string, string | undefined>;

export type OutgoingEmail = { to: string; subject: string; text: string };

export type SendResult =
  | { status: "sent"; providerId: string }
  | { status: "held" }
  | { status: "failed"; reason: string };

export type Transport = { apiKey: string; from: string; allowlist: string[] | null };

const ENDPOINT = "https://api.resend.com/emails";

export function transportFrom(env: EmailEnv = process.env): Transport | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  const entries = (env.EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return { apiKey, from, allowlist: entries.length > 0 ? entries : null };
}

export function allowed(transport: Transport, address: string): boolean {
  if (!transport.allowlist) return true;
  const target = address.trim().toLowerCase();
  const domain = target.slice(target.lastIndexOf("@"));
  return transport.allowlist.some((entry) => (entry.startsWith("@") ? entry === domain : entry === target));
}

function shortReason(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160) || "No reason given";
}

export async function sendEmail(transport: Transport, message: OutgoingEmail, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  if (!allowed(transport, message.to)) return { status: "held" };
  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${transport.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: transport.from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return { status: "failed", reason: shortReason(`Could not reach the email provider: ${error instanceof Error ? error.message : "unknown error"}`) };
  }
  const payload = (await response.json().catch(() => null)) as { id?: unknown; message?: unknown } | null;
  if (!response.ok) {
    const detail = typeof payload?.message === "string" ? payload.message : response.statusText;
    return { status: "failed", reason: shortReason(`Provider returned ${response.status}: ${detail}`) };
  }
  if (typeof payload?.id !== "string" || payload.id === "") return { status: "failed", reason: "The provider did not return a message id" };
  return { status: "sent", providerId: payload.id };
}

export function emailDeliveryOn(env: EmailEnv = process.env): boolean {
  return transportFrom(env) !== null;
}
