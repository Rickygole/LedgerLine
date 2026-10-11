import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";
import { listPeriods } from "@/lib/lifecycle/reminders";
import { loadPeriods } from "@/lib/finance/review/data";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
let app: Client;
let priya: string;
let initiative: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  initiative = (
    await owner.query("SELECT id FROM initiative WHERE fiscal_year_id = 'FY27' AND status = 'active' ORDER BY code LIMIT 1")
  ).rows[0].id;
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

function asTx(client: Client): Tx {
  return {
    async query(sql, params = []) {
      return (await client.query(sql, params)).rows as never;
    },
    async one(sql, params = []) {
      return ((await client.query(sql, params)).rows[0] ?? null) as never;
    },
  };
}

describe("[US-002] a custom report stays on its own initiative", () => {
  it("keeps per-initiative reports out of every shared period list", async () => {
    const id = await asUser(app, priya, async () => {
      const added = await app.query("SELECT app.add_custom_report($1, 'Scope check report', NULL, NULL, '2027-03-31') AS id", [
        initiative,
      ]);
      const created = added.rows[0].id as string;
      const shared = await loadPeriods(asTx(app));
      const reminders = await listPeriods(asTx(app));
      expect(shared.some((p) => p.id === created)).toBe(false);
      expect(reminders.some((p) => p.id === created)).toBe(false);
      expect(shared.length).toBe(
        (await owner.query("SELECT count(*)::int AS n FROM reporting_period WHERE initiative_id IS NULL")).rows[0].n,
      );
      return created;
    });
    expect(id).toBeTruthy();
  });

  it("gives a custom report a short reference and keeps standard references unchanged", async () => {
    const periodId = "FY27-XREFCHECK1";
    const created: string[] = [];
    await owner.query(
      "INSERT INTO reporting_period (id, fiscal_year_id, label, starts_on, ends_on, due_on, initiative_id) VALUES ($1, 'FY27', 'Reference check', '2026-07-01', '2027-03-31', '2027-03-31', $2)",
      [periodId, initiative],
    );
    try {
      const first = (await owner.query("SELECT app.next_reference_no($1) AS ref", [periodId])).rows[0].ref as string;
      const second = (await owner.query("SELECT app.next_reference_no($1) AS ref", [periodId])).rows[0].ref as string;
      created.push(first, second);
      expect(first).toMatch(/^LL-27C\d+-00001$/);
      expect(second).toMatch(/^LL-27C\d+-00002$/);
      expect(first.length).toBeLessThanOrEqual(16);
      const standard = (await owner.query("SELECT app.next_reference_no('FY27-MY') AS ref")).rows[0].ref as string;
      expect(standard).toMatch(/^LL-27MY-\d{5}$/);
      await owner.query("UPDATE reference_counter SET last_value = last_value - 1 WHERE period_id = 'FY27-MY'");
    } finally {
      await owner.query("DELETE FROM reference_counter WHERE period_id = $1", [periodId]);
      await owner.query("DELETE FROM reporting_period WHERE id = $1", [periodId]);
    }
  });
});
