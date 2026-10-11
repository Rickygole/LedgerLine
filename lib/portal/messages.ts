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

const DELIVERY: Record<string, { label: string; tone: "ok" | "bad" | "neutral" }> = {
  sent: { label: "Emailed", tone: "ok" },
  failed: { label: "Delivery failed", tone: "bad" },
  held: { label: "Held, not emailed", tone: "neutral" },
  recorded: { label: "Recorded", tone: "neutral" },
  queued: { label: "Waiting to send", tone: "neutral" },
  sending: { label: "Sending", tone: "neutral" },
};

export function deliveryState(status: string): { label: string; tone: "ok" | "bad" | "neutral" } {
  return DELIVERY[status] ?? { label: status, tone: "neutral" };
}
