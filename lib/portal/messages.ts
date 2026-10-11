import { transportFrom } from "@/lib/email";

const LABELS: Record<string, string> = {
  submission_confirmation: "Submission confirmation",
  return_notice: "Changes requested",
  acceptance_notice: "Report accepted",
};

export function templateLabel(template: string): string {
  return LABELS[template] ?? template.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export const DELIVERY_OFF_NOTICE =
  "Email delivery is not turned on in this environment. Each message is recorded here.";

export const DELIVERY_REDIRECT_NOTICE =
  "Messages are delivered to a review inbox in this environment, not to the addresses shown.";

export function deliveryNotice(env: Record<string, string | undefined> = process.env): string | null {
  const transport = transportFrom(env);
  if (!transport) return DELIVERY_OFF_NOTICE;
  return transport.redirectTo ? DELIVERY_REDIRECT_NOTICE : null;
}

export const REDIRECTED_SQL = "(o.delivered_to IS NOT NULL AND lower(o.delivered_to) <> lower(o.to_email))";

const DELIVERY: Record<string, { label: string; tone: "ok" | "bad" | "neutral" }> = {
  sent: { label: "Emailed", tone: "ok" },
  failed: { label: "Delivery failed", tone: "bad" },
  held: { label: "Held, not emailed", tone: "neutral" },
  recorded: { label: "Recorded", tone: "neutral" },
  queued: { label: "Waiting to send", tone: "neutral" },
  sending: { label: "Sending", tone: "neutral" },
};

export function deliveryState(status: string, redirected = false): { label: string; tone: "ok" | "bad" | "neutral" } {
  if (status === "sent" && redirected) return { label: "Emailed to the review inbox", tone: "ok" };
  return DELIVERY[status] ?? { label: status, tone: "neutral" };
}
