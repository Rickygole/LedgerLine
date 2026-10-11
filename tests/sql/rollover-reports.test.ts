import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let first: string;
let second: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  const rows = (
    await owner.query(
      `SELECT i.id FROM initiative i
       WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active'
         AND EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')
         AND NOT EXISTS (SELECT 1 FROM initiative_lineage l WHERE l.predecessor_id = i.id)
         AND NOT EXISTS (SELECT 1 FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE a.initiative_id = i.id)
       ORDER BY i.code LIMIT 2`,
    )
  ).rows;
  first = rows[0].id;
  second = rows[1].id;
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function successorOf(id: string): Promise<string> {
  return (await app.query("SELECT successor_id FROM initiative_lineage WHERE predecessor_id = $1", [id])).rows[0]
    .successor_id;
}

describe("[US-010][BR-015] a rollover carries an initiative's report setup into the new year", () => {
  it("maps removed standard reports to the matching period in the new year", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.set_required_period($1, 'FY27-MY', false)", [first]);
      const summary = (
        await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb) AS s", [
          JSON.stringify([{ initiative_id: first, action: "carry" }]),
        ])
      ).rows[0].s;
      expect(summary.exclusions_carried).toBe(1);
      const next = await successorOf(first);
      const removed = (
        await app.query("SELECT period_id FROM initiative_period_exclusion WHERE initiative_id = $1", [next])
      ).rows;
      expect(removed).toEqual([{ period_id: "FY28-MY" }]);
      expect((await app.query("SELECT app.requires_period($1, 'FY28-MY') AS r", [next])).rows[0].r).toBe(false);
      expect((await app.query("SELECT app.requires_period($1, 'FY28-YE') AS r", [next])).rows[0].r).toBe(true);
    });
  });

  it("recreates custom reports a year later with the standard reminder rules and a clean reference", async () => {
    await asUser(app, priya, async () => {
      const old = (
        await app.query(
          "SELECT app.add_custom_report($1, 'Quarterly check', '2026-10-01', '2026-12-31', '2027-01-15') AS id",
          [first],
        )
      ).rows[0].id as string;
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb)", [
        JSON.stringify([{ initiative_id: first, action: "carry" }]),
      ]);
      const next = await successorOf(first);
      const created = (
        await app.query(
          `SELECT id, label, starts_on::text AS starts_on, ends_on::text AS ends_on, due_on::text AS due_on, fiscal_year_id
           FROM reporting_period WHERE initiative_id = $1`,
          [next],
        )
      ).rows;
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        label: "Quarterly check",
        starts_on: "2027-10-01",
        ends_on: "2027-12-31",
        due_on: "2028-01-15",
        fiscal_year_id: "FY28",
      });
      expect(created[0].id).not.toBe(old);
      const rules = async (period: string) =>
        (await app.query("SELECT count(*)::int AS n FROM reminder_rule WHERE period_id = $1", [period])).rows[0].n;
      expect(await rules(created[0].id)).toBeGreaterThan(0);
      expect(await rules(created[0].id)).toBe(await rules(old));
      const reference = (await app.query("SELECT app.next_reference_no($1) AS r", [created[0].id])).rows[0].r;
      const oldReference = (await app.query("SELECT app.next_reference_no($1) AS r", [old])).rows[0].r;
      expect(reference).toMatch(/^LL-28C\d+-00001$/);
      expect(oldReference).toMatch(/^LL-27C\d+-00001$/);
      expect(reference).not.toBe(oldReference);
    });
  });

  it("leaves the old year's setup untouched", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.set_required_period($1, 'FY27-MY', false)", [first]);
      await app.query("SELECT app.add_custom_report($1, 'Quarterly check', NULL, NULL, '2027-01-15')", [first]);
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', '[]'::jsonb)");
      const kept = (
        await app.query(
          `SELECT (SELECT count(*)::int FROM initiative_period_exclusion WHERE initiative_id = $1) AS excluded,
                  (SELECT count(*)::int FROM reporting_period WHERE initiative_id = $1) AS custom`,
          [first],
        )
      ).rows[0];
      expect(kept).toEqual({ excluded: 1, custom: 1 });
    });
  });

  it("keeps a combined initiative's report required unless every predecessor dropped it, and gathers their custom reports", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.set_required_period($1, 'FY27-MY', false)", [first]);
      await app.query("SELECT app.set_required_period($1, 'FY27-MY', false)", [second]);
      await app.query("SELECT app.add_custom_report($1, 'First audit', NULL, NULL, '2027-02-15')", [first]);
      await app.query("SELECT app.set_required_period($1, 'FY27-YE', false)", [first]);
      await app.query("SELECT app.add_custom_report($1, 'Second audit', NULL, NULL, '2027-03-15')", [second]);
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb)", [
        JSON.stringify([
          { initiative_id: first, action: "combine", group: "g" },
          { initiative_id: second, action: "combine", group: "g" },
        ]),
      ]);
      const merged = await successorOf(first);
      expect(merged).toBe(await successorOf(second));
      const removed = (
        await app.query("SELECT period_id FROM initiative_period_exclusion WHERE initiative_id = $1", [merged])
      ).rows;
      expect(removed).toEqual([{ period_id: "FY28-MY" }]);
      const labels = (
        await app.query("SELECT label FROM reporting_period WHERE initiative_id = $1 ORDER BY due_on", [merged])
      ).rows.map((r) => r.label);
      expect(labels).toEqual(["First audit", "Second audit"]);
    });
  });

  it("records the carry in the audit trail", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.add_custom_report($1, 'Audit trail check', NULL, NULL, '2027-02-15')", [first]);
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb)", [
        JSON.stringify([{ initiative_id: first, action: "carry" }]),
      ]);
      const next = await successorOf(first);
      const audit = (
        await app.query(
          "SELECT after FROM audit_event WHERE entity = 'initiative' AND entity_id = $1 AND action = 'rollover_reports_carried'",
          [next],
        )
      ).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].after).toEqual({ exclusions: 0, custom_reports: 1 });
    });
  });
});
