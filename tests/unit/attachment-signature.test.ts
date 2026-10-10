import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { pathSignatureValid, signPath } from "@/lib/report/attachments";

const USER = "11111111-1111-4111-8111-111111111111";
const SUBMISSION = "22222222-2222-4222-8222-222222222222";
const PATH = "13-4027118/22222222-2222-4222-8222-222222222222/aaaa.pdf";
const now = () => Math.floor(Date.now() / 1000);

beforeAll(() => {
  process.env.AUTH_SECRET = "unit-test-secret-unit-test-secret-1234";
});

describe("[US-023] signed upload paths", () => {
  it("verifies a fresh signature", () => {
    expect(pathSignatureValid(USER, SUBMISSION, PATH, signPath(USER, SUBMISSION, PATH))).toBe(true);
  });

  it("refuses an expired signature", () => {
    expect(pathSignatureValid(USER, SUBMISSION, PATH, signPath(USER, SUBMISSION, PATH, now() - 1))).toBe(false);
  });

  it("expires a default signature in about 15 minutes", () => {
    const expiry = Number(signPath(USER, SUBMISSION, PATH).split(".")[0]);
    expect(expiry - now()).toBeGreaterThan(14 * 60);
    expect(expiry - now()).toBeLessThanOrEqual(15 * 60);
  });

  it("refuses a pushed-out expiry, another user, another path and junk", () => {
    const [, mac] = signPath(USER, SUBMISSION, PATH).split(".");
    expect(pathSignatureValid(USER, SUBMISSION, PATH, `${now() + 99999}.${mac}`)).toBe(false);
    expect(
      pathSignatureValid("33333333-3333-4333-8333-333333333333", SUBMISSION, PATH, signPath(USER, SUBMISSION, PATH)),
    ).toBe(false);
    expect(pathSignatureValid(USER, SUBMISSION, `${PATH}x`, signPath(USER, SUBMISSION, PATH))).toBe(false);
    expect(pathSignatureValid(USER, SUBMISSION, PATH, "not-a-signature")).toBe(false);
    expect(pathSignatureValid(USER, SUBMISSION, PATH, mac)).toBe(false);
  });

  it("does not sign with the raw AUTH_SECRET", () => {
    const expiry = now() + 600;
    const raw = createHmac("sha256", process.env.AUTH_SECRET as string)
      .update(`${USER}|${SUBMISSION}|${PATH}|${expiry}`)
      .digest("hex");
    expect(pathSignatureValid(USER, SUBMISSION, PATH, `${expiry}.${raw}`)).toBe(false);
  });
});
