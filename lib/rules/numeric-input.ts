export type NumericKind = "integer" | "number" | "currency" | "percent";

const EXPONENT = /\d\s*[eE]\s*[+-]?\s*\d/;
const EUROPEAN = /^-?\d{1,3}(\.\d{3})*,\d{1,2}$|^-?\d+,\d{1,2}$/;

export function sanitizeNumeric(kind: NumericKind, raw: string): string {
  let text = raw.replace(/[$%\s]/g, "").replace(/\u2212/g, "-");
  if (EXPONENT.test(text)) return raw.replace(/[$%\s]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (EUROPEAN.test(text)) text = text.replace(/\./g, "").replace(",", ".");
  text = text.replace(/,/g, "");
  const sign = negative ? "-" : "";
  const dot = text.indexOf(".");
  if (kind === "integer") {
    const whole = (dot >= 0 ? text.slice(0, dot) : text).replace(/\D/g, "");
    const fraction = dot >= 0 ? text.slice(dot + 1).replace(/\D/g, "") : "";
    if (/[1-9]/.test(fraction)) return `${sign}${whole}.${fraction}`;
    return `${sign}${whole}`;
  }
  text = text.replace(/[^\d.]/g, "");
  const point = text.indexOf(".");
  if (point < 0) return `${sign}${text}`;
  return `${sign}${text.slice(0, point + 1)}${text.slice(point + 1).replace(/\./g, "")}`;
}

export function typedTextAccepted(kind: NumericKind, data: string): boolean {
  return sanitizeNumeric(kind, data) !== "";
}
