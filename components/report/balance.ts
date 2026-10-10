import { formatCurrency, toCents } from "@/lib/rules/money";

export type BalanceTone = "ok" | "warn" | "bad";

export function balanceCopy(total: number, award: number): { tone: BalanceTone; text: string } {
  const diff = toCents(total) - toCents(award);
  if (diff === 0) return { tone: "ok", text: "Balanced" };
  if (diff < 0) return { tone: "warn", text: `Under by ${formatCurrency(-diff / 100)}` };
  return { tone: "bad", text: `Over by ${formatCurrency(diff / 100)}` };
}

export function signedDifference(total: number, award: number): string {
  const diff = toCents(total) - toCents(award);
  if (diff === 0) return formatCurrency(0);
  return `${diff > 0 ? "+" : "-"}${formatCurrency(Math.abs(diff) / 100)}`;
}

export function minusCurrency(value: number): string {
  return value < 0 ? `-${formatCurrency(Math.abs(value))}` : formatCurrency(value);
}
