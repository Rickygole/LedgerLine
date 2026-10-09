export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function parseAmount(raw: string): number | null {
  const text = raw.trim();
  if (text === "" || text === "-") return null;
  let negative = false;
  let body = text;
  if (/^\(.*\)$/.test(body)) {
    negative = true;
    body = body.slice(1, -1);
  }
  if (body.startsWith("-")) {
    negative = !negative;
    body = body.slice(1);
  }
  body = body.replace(/[$\s,]/g, "");
  let multiplier = 1;
  const suffix = body.slice(-1).toUpperCase();
  if (suffix === "K" || suffix === "M") {
    multiplier = suffix === "K" ? 1_000 : 1_000_000;
    body = body.slice(0, -1);
  }
  if (!/^\d*\.?\d+$/.test(body)) return null;
  const value = Number(body) * multiplier;
  if (!Number.isFinite(value)) return null;
  return (negative ? -1 : 1) * Math.round(value * 100) / 100;
}

const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  if (value < 0) return `(${currencyFormat.format(Math.abs(value))})`;
  return currencyFormat.format(value);
}

export function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return formatCurrency(value);
}

export function sumAmounts(values: number[]): number {
  return values.reduce((total, value) => total + toCents(value), 0) / 100;
}
