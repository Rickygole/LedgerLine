import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  anonymous: vi.fn(async () => {
    throw new Error("connect ECONNREFUSED postgres://app_server:secret@db.internal:5432/ledgerline");
  }),
}));

describe("[US-062] health check when the database is down", () => {
  it("reports degraded without leaking the connection error", async () => {
    const { getHealth } = await import("@/lib/ops/health");
    const health = await getHealth(new Date("2026-10-09T12:00:00Z"));
    expect(health.status).toBe("degraded");
    expect(health.database).toEqual({ ok: false, latencyMs: null });
    expect(health.migrations).toEqual({ ok: false, latest: null, applied: 0 });
    const text = JSON.stringify(health);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("ECONNREFUSED");
  });
});
