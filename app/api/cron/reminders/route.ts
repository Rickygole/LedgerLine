import { timingSafeEqual } from "node:crypto";
import { logError } from "@/lib/ops/log";
import { NextResponse, type NextRequest } from "next/server";
import { anonymous, withClaims } from "@/lib/db";
import { dispatchFor } from "@/lib/outbox-dispatch";
import { sweepOrphanFiles } from "@/lib/orphans";
import { daysBetween, todayInNewYork } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCHEDULER_EMAIL = "system.scheduler@ledgerline.example";
const OPEN_WINDOW_DAYS = 120;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "The scheduler is not configured." }, { status: 503 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const today = todayInNewYork();
  const scheduler = (await anonymous<{ id: string }>("SELECT app.ensure_scheduler() AS id"))[0]?.id;
  if (!scheduler) return NextResponse.json({ error: "The scheduler identity is missing." }, { status: 500 });

  const result = await withClaims(scheduler, async (tx) => {
    const who = await tx.one<{ email: string }>("SELECT email FROM app_user WHERE id = app.uid()");
    if (who?.email !== SCHEDULER_EMAIL) throw new Error("scheduler identity mismatch");
    const periods = await tx.query<{ id: string; due_on: string }>("SELECT id, due_on::text FROM reporting_period ORDER BY due_on");
    const open = periods.filter((p) => Math.abs(daysBetween(p.due_on, today)) <= OPEN_WINDOW_DAYS);
    const queued: Record<string, number> = {};
    for (const period of open) {
      const row = await tx.one<{ n: number }>("SELECT app.queue_reminders($1, $2::date) AS n", [period.id, today]);
      queued[period.id] = row?.n ?? 0;
    }
    return queued;
  });

  const delivery = await dispatchFor(scheduler, { limit: 100, rounds: 5 });

  const orphans = await withClaims(scheduler, (tx) => sweepOrphanFiles(tx)).catch(async (error: unknown) => {
    await logError("orphan_sweep_failed", error);
    return { checked: 0, deleted: 0, failed: true };
  });

  const total = Object.values(result).reduce((sum, n) => sum + n, 0);
  return NextResponse.json({ date: today, queued: total, periods: result, delivery, orphans });
}
