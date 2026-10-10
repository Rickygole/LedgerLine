export { actionInWords } from "@/lib/finance/audit-actions";

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
