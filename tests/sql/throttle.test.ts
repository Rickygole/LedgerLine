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
