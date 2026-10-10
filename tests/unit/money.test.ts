import { describe, expect, it } from "vitest";
import { parseAmount, sumAmounts } from "@/lib/rules/money";
import { formatCompactCurrency, formatCount, formatCurrency } from "@/lib/format";

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
    expect(formatCurrency(-4200, { cents: true })).toBe("($4,200.00)");
    expect(formatCurrency(85000, { cents: true })).toBe("$85,000.00");
  });
});

describe("number formatting", () => {
  it("shows whole dollars unless cents are asked for", () => {
    expect(formatCurrency(100000)).toBe("$100,000");
    expect(formatCurrency(85000.4)).toBe("$85,000");
    expect(formatCurrency(32076000, { cents: true })).toBe("$32,076,000.00");
    expect(formatCurrency(-2500)).toBe("($2,500)");
  });

  it("shows cents on a submitted answer only when it has some", () => {
    expect(formatCurrency(1250, { cents: "auto" })).toBe("$1,250");
    expect(formatCurrency(1250.5, { cents: "auto" })).toBe("$1,250.50");
  });

  it("writes large totals in prose as millions", () => {
    expect(formatCompactCurrency(30_912_345)).toBe("$30.9 million");
    expect(formatCompactCurrency(850_000)).toBe("$850,000");
  });

  it("adds thousands separators to counts", () => {
    expect(formatCount(42854)).toBe("42,854");
    expect(formatCount("1136")).toBe("1,136");
    expect(formatCount(7)).toBe("7");
    expect(formatCount("not a number")).toBe("not a number");
    expect(formatCount("")).toBe("");
  });
});
