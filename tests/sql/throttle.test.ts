import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, connect, ownerUrl } from "./helpers";

let owner: Client;
let clients: Client[] = [];
const keys: string[] = [];

beforeAll(async () => {
  owner = await connect(ownerUrl());
  clients = await Promise.all(Array.from({ length: 40 }, () => connect(appUrl())));
});

afterAll(async () => {
  if (keys.length) await owner?.query("DELETE FROM auth_attempt WHERE key = ANY($1)", [keys]);
  await Promise.all(clients.map((c) => c.end()));
  await owner?.end();
});

describe("[BR-010] login throttle holds under concurrency", () => {
  it("allows exactly 8 of 40 parallel attempts on one key", async () => {
    const key = `test-race-${randomUUID()}`;
    keys.push(key);
    const results = await Promise.all(clients.map((c) => c.query("SELECT app.record_attempt($1, 15, 8) AS ok", [key]).then((r) => r.rows[0].ok as boolean)));
    expect(results.filter(Boolean)).toHaveLength(8);
    const after = await clients[0].query("SELECT app.record_attempt($1, 15, 8) AS ok", [key]);
    expect(after.rows[0].ok).toBe(false);
  });

  it("does not let one key's burst use up another key's allowance", async () => {
    const a = `test-race-${randomUUID()}`;
    const b = `test-race-${randomUUID()}`;
    keys.push(a, b);
    await Promise.all(clients.slice(0, 20).map((c) => c.query("SELECT app.record_attempt($1, 15, 3)", [a])));
    const other = await clients[0].query("SELECT app.record_attempt($1, 15, 3) AS ok", [b]);
    expect(other.rows[0].ok).toBe(true);
  });
});

describe("[BR-011] only failed attempts count toward the lockout", () => {
  it("checks a key without recording an attempt", async () => {
    const key = `test-check-${randomUUID()}`;
    keys.push(key);
    for (let i = 0; i < 20; i++) await clients[0].query("SELECT app.attempts_blocked($1, 15, 8)", [key]);
    expect((await owner.query("SELECT count(*)::int AS n FROM auth_attempt WHERE key = $1", [key])).rows[0].n).toBe(0);
    expect((await clients[0].query("SELECT app.attempts_blocked($1, 15, 8) AS blocked", [key])).rows[0].blocked).toBe(false);
  });

  it("blocks after the limit of recorded failures and clears after a successful sign-in", async () => {
    const key = `test-clear-${randomUUID()}`;
    keys.push(key);
    for (let i = 0; i < 8; i++) await clients[0].query("SELECT app.record_attempt($1, 15, 8)", [key]);
    expect((await clients[0].query("SELECT app.attempts_blocked($1, 15, 8) AS blocked", [key])).rows[0].blocked).toBe(true);
    await clients[0].query("SELECT app.clear_attempts($1)", [key]);
    expect((await clients[0].query("SELECT app.attempts_blocked($1, 15, 8) AS blocked", [key])).rows[0].blocked).toBe(false);
  });
});
