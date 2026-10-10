import { nowDate } from "@/lib/dates";
import { anonymous } from "@/lib/db";

export type Hosting = { provider: string; region: string; declared: boolean; onCouncilServers: boolean };

export type Health = {
  status: "ok" | "degraded";
  checkedAt: string;
  database: { ok: boolean; latencyMs: number | null };
  migrations: { ok: boolean; latest: string | null; applied: number };
  build: { commit: string | null };
  hosting: Hosting;
};

type Env = Record<string, string | undefined>;

export function hostingInfo(env: Env = process.env): Hosting {
  const provider = env.HOSTING_PROVIDER?.trim() || (env.VERCEL ? "Vercel" : "");
  const region = env.HOSTING_REGION?.trim() || env.VERCEL_REGION?.trim() || "";
  return {
    provider: provider || "Not declared",
    region: region || "Not declared",
    declared: provider !== "",
    onCouncilServers: env.HOSTED_ON_COUNCIL_SERVERS === "true",
  };
}

export function buildCommit(
  env: Env = { BUILD_COMMIT: process.env.BUILD_COMMIT, VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA },
): string | null {
  const sha = (env.BUILD_COMMIT || env.VERCEL_GIT_COMMIT_SHA || "").trim();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12) : null;
}

export async function getHealth(now: Date = nowDate()): Promise<Health> {
  const started = performance.now();
  let database = { ok: false, latencyMs: null as number | null };
  let migrations = { ok: false, latest: null as string | null, applied: 0 };
  try {
    const rows = await anonymous<{ latest: string | null; applied: number }>(
      "SELECT max(name) AS latest, count(*)::int AS applied FROM schema_migration",
    );
    database = { ok: true, latencyMs: Math.round(performance.now() - started) };
    const row = rows[0];
    migrations = { ok: Boolean(row && row.applied > 0), latest: row?.latest ?? null, applied: row?.applied ?? 0 };
  } catch {
    database = { ok: false, latencyMs: null };
  }
  return {
    status: database.ok && migrations.ok ? "ok" : "degraded",
    checkedAt: now.toISOString(),
    database,
    migrations,
    build: { commit: buildCommit() },
    hosting: hostingInfo(),
  };
}
