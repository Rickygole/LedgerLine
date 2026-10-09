import { describe, expect, it } from "vitest";
import { buildCsp, cspHeaderName } from "@/lib/csp";

describe("content security policy", () => {
  it("allows scripts only with the request nonce and blocks framing", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("only allows eval in development", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });

  it("switches to report only by setting", () => {
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
    expect(cspHeaderName(undefined)).toBe("Content-Security-Policy");
  });
});
