import { statusLabel } from "@/lib/domain";
export { actionInWords } from "@/lib/finance/audit-actions";

export function statusInWords(status: unknown): string {
  return typeof status === "string" ? statusLabel(status) : "";
}
