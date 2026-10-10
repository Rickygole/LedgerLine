const currencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeCurrencyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const countFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatCurrency(value: number, options: { cents?: boolean } = {}): string {
  const format = options.cents === false ? wholeCurrencyFormat : currencyFormat;
  if (value < 0) return `(${format.format(Math.abs(value))})`;
  return format.format(value);
}

export function formatCount(value: number | string): string {
  if (typeof value === "string" && value.trim() === "") return "";
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? countFormat.format(n) : String(value);
}

export function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return formatCurrency(value);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

export function counted(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${plural(count, one, many)}`;
}
