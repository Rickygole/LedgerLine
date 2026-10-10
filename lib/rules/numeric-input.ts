export type NumericKind = "integer" | "number" | "currency" | "percent";

export function sanitizeNumeric(kind: NumericKind, raw: string): string {
  let text = raw.replace(/[$,%\s]/g, "");
  if (kind === "integer") {
    const dot = text.indexOf(".");
    if (dot >= 0) text = text.slice(0, dot);
    return text.replace(/\D/g, "");
  }
  text = text.replace(/[^\d.]/g, "");
  const dot = text.indexOf(".");
  if (dot < 0) return text;
  return `${text.slice(0, dot + 1)}${text.slice(dot + 1).replace(/\./g, "")}`;
}

export function typedCharsAllowed(kind: NumericKind, data: string): boolean {
  const allowed = kind === "integer" ? /^[\d,\s]*$/ : /^[\d.,$%\s]*$/;
  return allowed.test(data);
}
