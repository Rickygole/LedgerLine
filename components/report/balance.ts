import { toCents } from "@/lib/rules/money";
import { formatCurrency } from "@/lib/format";

type BalanceTone = "ok" | "warn" | "bad";

export function balanceCopy(total: number, award: number): { tone: BalanceTone; text: string } {
  const diff = toCents(total) - toCents(award);
  if (diff === 0) return { tone: "ok", text: "Balanced" };
  if (diff < 0) return { tone: "warn", text: `Under by ${formatCurrency(-diff / 100, { cents: true })}` };
  return { tone: "bad", text: `Over by ${formatCurrency(diff / 100, { cents: true })}` };
}

export function signedDifference(total: number, award: number): string {
  const diff = toCents(total) - toCents(award);
  if (diff === 0) return formatCurrency(0, { cents: true });
  return `${diff > 0 ? "+" : "-"}${formatCurrency(Math.abs(diff) / 100, { cents: true })}`;
}

export function minusCurrency(value: number): string {
  return value < 0 ? `-${formatCurrency(Math.abs(value), { cents: true })}` : formatCurrency(value, { cents: true });
}
