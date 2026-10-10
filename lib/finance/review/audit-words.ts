export { actionInWords } from "@/lib/finance/audit-actions";

export const QUIET_ACTIONS = ["sign_in", "sign_out", "reminder_defaults_restored", "reminders_queued", "password_reset_requested", "export", "export_all"];

const STATUS_WORDS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "In review",
  returned: "Update requested",
  accepted: "Accepted",
};

export function statusInWords(status: unknown): string {
  return typeof status === "string" ? (STATUS_WORDS[status] ?? status) : "";
}
