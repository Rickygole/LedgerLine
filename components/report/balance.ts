import { formatCurrency, toCents } from "@/lib/rules/money";

export function balanceCopy(total: number, award: number): { tone: "ok" | "warn" | "bad"; text: string } {
  const diff = toCents(total) - toCents(award);
  if (diff === 0) return { tone: "ok", text: `Balanced to award ${formatCurrency(award)}` };
  if (diff < 0) return { tone: "warn", text: `${formatCurrency(-diff / 100)} under award` };
  return { tone: "bad", text: `${formatCurrency(diff / 100)} over award` };
}
