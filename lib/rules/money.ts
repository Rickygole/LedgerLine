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
  let shift = 2;
  const suffix = body.slice(-1).toUpperCase();
  if (suffix === "K" || suffix === "M") {
    shift = suffix === "K" ? 5 : 8;
    body = body.slice(0, -1);
  }
  if (!/^\d*\.?\d+$/.test(body)) return null;
  const [whole, fraction = ""] = body.split(".");
  const digits = fraction.padEnd(shift + 1, "0");
  const cents = Number(`${whole}${digits.slice(0, shift)}`) + (Number(digits[shift]) >= 5 ? 1 : 0);
  if (!Number.isFinite(cents)) return null;
  return ((negative ? -1 : 1) * cents) / 100;
}

export function sumAmounts(values: number[]): number {
  return values.reduce((total, value) => total + toCents(value), 0) / 100;
}
