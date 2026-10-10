import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let due: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  due = (await owner.query("SELECT due_on::text AS d FROM reporting_period WHERE id = 'FY26-YE'")).rows[0].d;
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function withRule<T>(fn: (ruleId: string) => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: priya })]);
    const rule = (
      await app.query(
        `INSERT INTO reminder_rule (period_id, offset_days, template_subject, template_body, created_by)
         VALUES ('FY26-YE', 360, 'Catch-up {period}', E'Hello,\n\nCatch-up.', app.uid()) RETURNING id`,
      )
    ).rows[0].id as string;
    return await fn(rule);
  } finally {
    await app.query("ROLLBACK");
  }
}

function day(offset: number): string {
  const [y, m, d] = due.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

async function targets(rule: string, offset: number): Promise<number> {
  return (
    await app.query("SELECT count(*)::int AS n FROM app.reminder_targets('FY26-YE', $1::date) WHERE rule_id = $2", [
      day(offset),
      rule,
    ])
  ).rows[0].n;
}

async function queue(rule: string, offset: number): Promise<number> {
  await app.query("SELECT app.queue_reminders('FY26-YE', $1::date)", [day(offset)]);
  return (
    await app.query("SELECT count(*)::int AS n FROM outbox WHERE template = 'reminder' AND reminder_key LIKE $1", [
      `${rule}:%`,
    ])
  ).rows[0].n;
}

describe("[US-052] a missed daily run still sends the reminder, once", () => {
  it("does not send before the send date", async () => {
    await withRule(async (rule) => {
      expect(await targets(rule, 359)).toBe(0);
      expect(await targets(rule, 360)).toBeGreaterThan(0);
    });
  });

  it("sends a missed reminder on the next days within the catch-up window", async () => {
    await withRule(async (rule) => {
      const onTime = await targets(rule, 360);
      expect(await targets(rule, 361)).toBe(onTime);
      expect(await targets(rule, 362)).toBe(onTime);
      expect(await targets(rule, 363)).toBe(0);
    });
  });

  it("keys the message to the send date so a late run uses the same key as an on-time run", async () => {
    await withRule(async (rule) => {
      const queued = await queue(rule, 362);
      expect(queued).toBeGreaterThan(0);
      const keys = (
        await app.query(
          "SELECT DISTINCT split_part(reminder_key, ':', 3) AS d FROM outbox WHERE reminder_key LIKE $1",
          [`${rule}:%`],
        )
      ).rows;
      expect(keys).toEqual([{ d: day(360) }]);
    });
  });

  it("never sends the same reminder twice across consecutive catch-up days", async () => {
    await withRule(async (rule) => {
      const first = await queue(rule, 361);
      expect(first).toBeGreaterThan(0);
      expect(await queue(rule, 362)).toBe(first);
      expect(await queue(rule, 360)).toBe(first);
      const unsent = (
        await app.query(
          "SELECT count(*)::int AS n FROM app.reminder_targets('FY26-YE', $1::date) WHERE rule_id = $2 AND NOT already_sent",
          [day(362), rule],
        )
      ).rows[0].n;
      expect(unsent).toBe(0);
    });
  });

  it("marks a reminder already sent in the preview once it is queued", async () => {
    await withRule(async (rule) => {
      await queue(rule, 360);
      const rows = (
        await app.query("SELECT already_sent FROM app.reminder_targets('FY26-YE', $1::date) WHERE rule_id = $2", [
          day(361),
          rule,
        ])
      ).rows;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.already_sent)).toBe(true);
    });
  });
});
