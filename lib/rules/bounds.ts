const MAX_COUNT = 10_000_000;
const MAX_CENTS = 99_999_999_999;
const MAX_PERCENT = 100;
const MAX_AMOUNT_TEXT = "$999,999,999.99";

type NumericKind = "integer" | "number" | "currency" | "percent";

const DECIMAL = /^(\d+\.?\d*|\.\d+)$/;

function significantDigits(whole: string): number {
  return whole.replace(/^0+(?=\d)/, "").length;
}

export function numericProblem(kind: NumericKind, raw: string, label: string): string | null {
  if (raw.trim() === "") return null;
  let text = raw.trim();
  if (kind === "currency") text = text.replace(/[$,]/g, "").trim();
  if (kind === "percent") text = text.replace(/%$/, "").trim();
  if (/^-\s*[\d.]/.test(text)) return `${label} cannot be negative.`;

  const countText = MAX_COUNT.toLocaleString("en-US");
  if (kind === "integer") {
    if (!/^\d+$/.test(text)) return `${label} must be a whole number.`;
    if (significantDigits(text) > 8 || Number(text) > MAX_COUNT) return `${label} must be ${countText} or less.`;
    return null;
  }
  if (!DECIMAL.test(text)) {
    if (kind === "currency") return `${label} must be a dollar amount, like 1250.00.`;
    if (kind === "percent") return `${label} must be a percentage between 0 and 100.`;
    return `${label} must be a number.`;
  }
  if (/\.\d{3,}/.test(text)) return `${label} can have at most 2 decimal places.`;
  const whole = text.split(".")[0] ?? "";
  if (kind === "number") return significantDigits(whole) > 8 || Number(text) > MAX_COUNT ? `${label} must be ${countText} or less.` : null;
  if (kind === "currency") return significantDigits(whole) > 9 ? `${label} must be ${MAX_AMOUNT_TEXT} or less.` : null;
  return Number(text) > MAX_PERCENT ? `${label} must be a percentage between 0 and 100.` : null;
}

export function amountBoundsProblem(amount: number, label: string): string | null {
  if (!Number.isFinite(amount)) return `${label} must be a dollar amount.`;
  if (amount < 0) return `${label} cannot be negative.`;
  const cents = amount * 100;
  if (cents > MAX_CENTS) return `${label} must be ${MAX_AMOUNT_TEXT} or less.`;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) return `${label} can have at most 2 decimal places.`;
  return null;
}
