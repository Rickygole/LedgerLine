import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/redirect";

describe("safe post sign-in redirects", () => {
  it("keeps same-site paths with query strings", () => {
    expect(safeNext("/finance/submissions?bucket=missing", "/")).toBe("/finance/submissions?bucket=missing");
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeNext("//evil.example", "/home")).toBe("/home");
    expect(safeNext("/\\evil.example", "/home")).toBe("/home");
    expect(safeNext("https://evil.example", "/home")).toBe("/home");
    expect(safeNext("/%5Cevil.example", "/home")).toBe("/%5Cevil.example");
  });

  it("falls back when missing", () => {
    expect(safeNext(null, "/login")).toBe("/login");
  });
});
