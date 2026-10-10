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

describe("[BR-010] normalised paths never become protocol-relative", () => {
  const payloads = [
    "/..//evil.example/x",
    "/.//evil.example/x",
    "/%2e%2e//evil.example/x",
    "/a/..//evil.example/x",
    "/a/../..//evil.example",
    "/./\\evil.example",
    "/..//",
    "/a/..//",
  ];

  it.each(payloads)("falls back for %s", (payload) => {
    expect(safeNext(payload, "/home")).toBe("/home");
  });

  it("never returns a path starting with // or /\\", () => {
    for (const payload of payloads) {
      const result = safeNext(payload, "/home");
      expect(result.startsWith("//")).toBe(false);
      expect(result.startsWith("/\\")).toBe(false);
    }
  });

  it("still returns ordinary normalised paths", () => {
    expect(safeNext("/a/../finance?x=1#top", "/home")).toBe("/finance?x=1#top");
    expect(safeNext("/", "/home")).toBe("/");
  });
});
