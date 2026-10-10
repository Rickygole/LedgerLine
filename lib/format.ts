const centsFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const countFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function formatCurrency(value: number, options: { cents?: boolean | "auto" } = {}): string {
  const whole = options.cents === "auto" ? Math.round(value * 100) % 100 === 0 : options.cents !== true;
  const format = whole ? wholeFormat : centsFormat;
  if (value < 0) return `(${format.format(Math.abs(value))})`;
  return format.format(value);
}

export function formatCount(value: number | string): string {
  if (typeof value === "string" && value.trim() === "") return "";
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? countFormat.format(n) : String(value);
}

export function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)} million`;
  return formatCurrency(value);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

export function counted(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${plural(count, one, many)}`;
}
