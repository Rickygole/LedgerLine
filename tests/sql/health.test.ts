import { readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealth } from "@/lib/ops/health";
import { appUrl, connect } from "./helpers";

describe("[US-062] health check reads the database and the migration version", () => {
  it("reports a connected database and the latest applied migration", async () => {
    const health = await getHealth(new Date("2026-10-09T12:00:00Z"));
    const files = readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(health.status).toBe("ok");
    expect(health.checkedAt).toBe("2026-10-09T12:00:00.000Z");
    expect(health.database.ok).toBe(true);
    expect(health.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(health.migrations).toEqual({ ok: true, latest: files[files.length - 1], applied: files.length });
  });

  it("exposes nothing sensitive", async () => {
    const text = JSON.stringify(await getHealth());
    for (const secret of [
      process.env.APP_DATABASE_URL,
      process.env.DB_OWNER_URL,
      process.env.AUTH_SECRET,
      process.env.GATE_PASSCODE,
      process.env.GATE_COOKIE_SECRET,
      process.env.APP_SERVER_PASSWORD,
      "postgres://",
      "password",
      "@localhost",
    ]) {
      if (secret) expect(text).not.toContain(secret);
    }
    expect(Object.keys(JSON.parse(text)).sort()).toEqual([
      "build",
      "checkedAt",
      "database",
      "hosting",
      "migrations",
      "status",
    ]);
  });

  it("lets the application account read only what the check needs", async () => {
    const app = await connect(appUrl());
    try {
      const { rows } = await app.query("SELECT count(*)::int AS n FROM schema_migration");
      expect(rows[0].n).toBeGreaterThan(0);
    } finally {
      await app.end();
    }
  });
});

describe("[US-053] the system reports that it is hosted outside Council servers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("declares the hosting provider and reports onCouncilServers false in the health payload", async () => {
    vi.stubEnv("HOSTING_PROVIDER", "Vercel");
    vi.stubEnv("HOSTING_REGION", "iad1");
    vi.stubEnv("HOSTED_ON_COUNCIL_SERVERS", "");
    const payload = JSON.parse(JSON.stringify(await getHealth()));
    expect(payload.hosting).toEqual({ provider: "Vercel", region: "iad1", declared: true, onCouncilServers: false });
  });

  it("reports Council servers only when the deployment says so", async () => {
    vi.stubEnv("HOSTING_PROVIDER", "Vercel");
    vi.stubEnv("HOSTED_ON_COUNCIL_SERVERS", "true");
    expect((await getHealth()).hosting.onCouncilServers).toBe(true);
  });
});
