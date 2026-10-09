import { describe, expect, it } from "vitest";
import { hashToken, isTokenFormat, passwordProblem } from "@/lib/password";

describe("[US-038] new password rules", () => {
  const email = "maria.santos@motthavenyouth.example.org";

  it("requires at least 12 characters", () => {
    expect(passwordProblem("short-pass1", "short-pass1", email)).toMatch(/at least 12/);
    expect(passwordProblem("twelve-chars", "twelve-chars", email)).toBeNull();
  });

  it("rejects the email address as the password in any case", () => {
    expect(passwordProblem(email, email, email)).toMatch(/email/);
    expect(passwordProblem(email.toUpperCase(), email.toUpperCase(), email)).toMatch(/email/);
  });

  it("requires the confirmation to match", () => {
    expect(passwordProblem("twelve-chars", "twelve-charz", email)).toMatch(/do not match/);
  });

  it("rejects passwords longer than bcrypt can use", () => {
    const long = "x".repeat(73);
    expect(passwordProblem(long, long, email)).toMatch(/72/);
  });
});

describe("[US-038] reset token format", () => {
  it("accepts 64 hex characters only", () => {
    expect(isTokenFormat("a".repeat(64))).toBe(true);
    expect(isTokenFormat("A".repeat(64))).toBe(false);
    expect(isTokenFormat("a".repeat(63))).toBe(false);
    expect(isTokenFormat("")).toBe(false);
  });

  it("hashes to a stable sha256 hex digest", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
