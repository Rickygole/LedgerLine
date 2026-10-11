import { parseAmount } from "@/lib/rules/money";
import { formatCount, formatCurrency } from "@/lib/format";

export function cellText(type: string, raw: unknown): string {
  const text = String(raw ?? "").trim();
  if (text === "" || type === "text") return text;
  if (type === "currency") {
    const amount = parseAmount(text);
    return amount === null ? text : formatCurrency(amount, { cents: "auto" });
  }
  if (type === "percent") return text.endsWith("%") ? text : `${text}%`;
  return formatCount(text);
}
