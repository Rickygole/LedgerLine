import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, ownerUrl } from "./helpers";

let forwardedFor = "";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", forwardedFor]]),
  cookies: async () => ({ set: () => undefined, get: () => undefined, delete: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { target });
  },
}));

import { unlockGate } from "@/app/actions/session";

const passcode = "correct horse battery staple";
const form = (value: string) => {
  const data = new FormData();
  data.set("passcode", value);
  return data;
};
const attempt = async (value: string) => {
  try {
    return await unlockGate(undefined, form(value));
  } catch (error) {
    return { redirected: (error as { target?: string }).target ?? "unknown" };
  }
};

let owner: Awaited<ReturnType<typeof connect>>;
const used: string[] = [];

beforeAll(async () => {
  process.env.GATE_PASSCODE = passcode;
  owner = await connect(ownerUrl());
});

beforeEach(() => {
  forwardedFor = `203.0.113.${randomUUID()}`;
  used.push(`gate:${forwardedFor}`);
});

afterAll(async () => {
  await owner?.query("DELETE FROM auth_attempt WHERE key = ANY($1)", [used]);
  await owner?.end();
});

describe("[BR-011] the passcode gate counts only wrong passcodes", () => {
  it("lets 25 correct unlocks in a row through from one address", async () => {
    for (let i = 0; i < 25; i++) expect(await attempt(passcode)).toEqual({ redirected: "/" });
  });

  it("locks an address after repeated wrong passcodes, then refuses even the right one", async () => {
    for (let i = 0; i < 20; i++) expect(await attempt("wrong")).toEqual({ error: "That passcode is not correct." });
    expect(await attempt("wrong")).toMatchObject({ error: expect.stringContaining("Too many attempts") });
    expect(await attempt(passcode)).toMatchObject({ error: expect.stringContaining("Too many attempts") });
  });

  it("clears earlier wrong passcodes when the right one is entered", async () => {
    for (let i = 0; i < 15; i++) await attempt("wrong");
    expect(await attempt(passcode)).toEqual({ redirected: "/" });
    for (let i = 0; i < 15; i++) expect(await attempt("wrong")).toEqual({ error: "That passcode is not correct." });
  });
});
