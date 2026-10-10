import type { Client } from "pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, ownerUrl } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
const key = "2026-10-14";

beforeAll(async () => {
  owner = await connect(ownerUrl());
  await owner.query("SELECT app.ensure_scheduler()");
  await owner.query("DELETE FROM outbox WHERE reminder_key LIKE '%:' || $1", [key]);
});

afterAll(async () => {
  await owner.query("DELETE FROM outbox WHERE reminder_key LIKE '%:' || $1", [key]);
  vi.unstubAllEnvs();
  await owner?.end();
});

function call(token: string | null) {
  return import("@/app/api/cron/reminders/route").then(({ GET }) =>
    GET(
      new NextRequest("http://localhost/api/cron/reminders", {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    ),
  );
}

describe("[US-052] the reminder cron sends what is due on the real date", () => {
  it("is not configured without a secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(null)).status).toBe(503);
  });

  it("rejects a wrong or missing token", async () => {
    vi.stubEnv("CRON_SECRET", "local-cron-test");
    expect((await call(null)).status).toBe(401);
    expect((await call("nope")).status).toBe(401);
  });

  it("queues the second notice on its due date and nothing on a repeat run", async () => {
    vi.stubEnv("CRON_SECRET", "local-cron-test");
    vi.stubEnv("DEMO_TODAY", key);
    const first = await call("local-cron-test");
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.date).toBe(key);
    expect(body.queued).toBeGreaterThan(0);
    const rows = (
      await owner.query(
        "SELECT subject, status FROM outbox WHERE template = 'reminder' AND reminder_key LIKE '%:' || $1",
        [key],
      )
    ).rows;
    expect(rows).toHaveLength(body.queued);
    expect(rows[0].subject).toContain("Second notice");
    const second = await (await call("local-cron-test")).json();
    expect(second.queued).toBe(0);
  });
});
