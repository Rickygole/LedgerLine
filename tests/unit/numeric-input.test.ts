import { describe, expect, it } from "vitest";
import { sanitizeNumeric, typedCharsAllowed } from "@/lib/rules/numeric-input";

describe("[US-029] numeric fields filter what is typed and normalize what is pasted", () => {
  it("drops letters from every numeric kind", () => {
    expect(sanitizeNumeric("number", "12ab3")).toBe("123");
    expect(sanitizeNumeric("currency", "abc")).toBe("");
    expect(sanitizeNumeric("percent", "5x0")).toBe("50");
    expect(sanitizeNumeric("integer", "1e5")).toBe("15");
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
    expect(sanitizeNumeric("integer", "12.5")).toBe("12");
  });

  it("blocks typed letters and, for whole numbers, typed decimal points", () => {
    expect(typedCharsAllowed("currency", "a")).toBe(false);
    expect(typedCharsAllowed("currency", "7")).toBe(true);
    expect(typedCharsAllowed("currency", ".")).toBe(true);
    expect(typedCharsAllowed("integer", ".")).toBe(false);
  });
});
