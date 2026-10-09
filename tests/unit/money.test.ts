import { describe, expect, it } from "vitest";
import { formatCurrency, parseAmount, sumAmounts } from "@/lib/rules/money";

describe("[US-025] amount parsing", () => {
  it("reads plain, dollar and comma formatted values", () => {
    expect(parseAmount("1250")).toBe(1250);
    expect(parseAmount("$1,250.50")).toBe(1250.5);
    expect(parseAmount(" 3,000 ")).toBe(3000);
  });

  it("treats parentheses as negative", () => {
    expect(parseAmount("(500)")).toBe(-500);
    expect(parseAmount("($1,200.00)")).toBe(-1200);
  });

  it("expands K and M suffixes", () => {
    expect(parseAmount("1.2K")).toBe(1200);
    expect(parseAmount("2M")).toBe(2_000_000);
  });

  it("rounds half a cent up using exact digits, not floating point", () => {
    expect(parseAmount("0.285")).toBe(0.29);
    expect(parseAmount("1.005")).toBe(1.01);
    expect(parseAmount("1.004")).toBe(1);
    expect(parseAmount("(2.675)")).toBe(-2.68);
    expect(parseAmount("1.23455K")).toBe(1234.55);
    expect(parseAmount(".5")).toBe(0.5);
  });

  it("rejects text that is not an amount", () => {
    expect(parseAmount("Program Director")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("[US-026] totals", () => {
  it("adds in cents so floating point never drifts", () => {
    expect(sumAmounts([0.1, 0.2])).toBe(0.3);
    expect(sumAmounts(Array(100).fill(0.01))).toBe(1);
  });

  it("formats negatives with parentheses", () => {
    expect(formatCurrency(-4200)).toBe("($4,200.00)");
    expect(formatCurrency(85000)).toBe("$85,000.00");
  });
});
