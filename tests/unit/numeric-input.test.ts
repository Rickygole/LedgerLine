import { describe, expect, it } from "vitest";
import { numericProblem } from "@/lib/rules/bounds";
import { sanitizeNumeric, typedTextAccepted } from "@/lib/rules/numeric-input";

describe("[US-029] numeric fields filter what is typed and normalize what is pasted", () => {
  it("drops letters from every numeric kind", () => {
    expect(sanitizeNumeric("number", "12ab3")).toBe("123");
    expect(sanitizeNumeric("currency", "abc")).toBe("");
    expect(sanitizeNumeric("percent", "5x0")).toBe("50");
  });

  it("normalizes a pasted dollar amount", () => {
    expect(sanitizeNumeric("currency", "$1,250.00")).toBe("1250.00");
    expect(sanitizeNumeric("currency", " $ 85,000 ")).toBe("85000");
  });

  it("keeps one decimal point and a trailing point while typing", () => {
    expect(sanitizeNumeric("number", "12.")).toBe("12.");
    expect(sanitizeNumeric("number", "1.2.3")).toBe("1.23");
  });

  it("strips a percent sign and keeps whole numbers whole", () => {
    expect(sanitizeNumeric("percent", "45.5%")).toBe("45.5");
    expect(sanitizeNumeric("integer", "1,250.00")).toBe("1250");
  });

  it("keeps a pasted fraction in a whole-number field so validation can name it", () => {
    expect(sanitizeNumeric("integer", "12.9")).toBe("12.9");
    expect(sanitizeNumeric("integer", "12.5")).toBe("12.5");
    expect(numericProblem("integer", sanitizeNumeric("integer", "12.9"), "Sites")).toBe(
      "Sites must be a whole number.",
    );
  });

  it("keeps the sign so validation says the value cannot be negative", () => {
    expect(sanitizeNumeric("currency", "-5,000")).toBe("-5000");
    expect(sanitizeNumeric("currency", "-$5")).toBe("-5");
    expect(sanitizeNumeric("currency", "(1,250.00)")).toBe("-1250.00");
    expect(sanitizeNumeric("integer", "-4")).toBe("-4");
    expect(numericProblem("currency", sanitizeNumeric("currency", "(1,250.00)"), "Cost")).toBe(
      "Cost cannot be negative.",
    );
    expect(numericProblem("integer", sanitizeNumeric("integer", "-4"), "Sites")).toBe("Sites cannot be negative.");
  });

  it("refuses an exponent instead of joining its digits", () => {
    expect(sanitizeNumeric("integer", "1e5")).toBe("1e5");
    expect(sanitizeNumeric("currency", "2.5E3")).toBe("2.5E3");
    expect(numericProblem("integer", sanitizeNumeric("integer", "1e5"), "Sites")).toBe("Sites must be a whole number.");
    expect(numericProblem("currency", sanitizeNumeric("currency", "1e5"), "Cost")).toBe(
      "Cost must be a dollar amount, like 1250.00.",
    );
    expect(typedTextAccepted("integer", "e")).toBe(false);
  });

  it("reads a European decimal comma as a decimal and never as thousands", () => {
    expect(sanitizeNumeric("currency", "1.250,00")).toBe("1250.00");
    expect(sanitizeNumeric("currency", "12,5")).toBe("12.5");
    expect(sanitizeNumeric("currency", "1,250")).toBe("1250");
  });

  it("blocks typed letters and, for whole numbers, typed decimal points", () => {
    expect(typedTextAccepted("currency", "a")).toBe(false);
    expect(typedTextAccepted("currency", "$1,250.00")).toBe(true);
    expect(typedTextAccepted("currency", "7")).toBe(true);
    expect(typedTextAccepted("currency", ".")).toBe(true);
    expect(typedTextAccepted("integer", ".")).toBe(false);
  });
});
