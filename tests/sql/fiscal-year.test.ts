import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, asUser, connect, errorCode, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let maria: string;
let mariaOrg: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  maria = await userId(owner, "maria.santos");
  mariaOrg = (await owner.query("SELECT org_id FROM app_user WHERE id = $1", [maria])).rows[0].org_id;
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function addFy27Initiative(name: string): Promise<string> {
  const init = (
    await app.query(
      `INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding)
       VALUES ('CI-T-' || floor(random() * 1e6)::int, $1, 'Education', 'Adult classes added during the test run.', 'FY27', 0) RETURNING id`,
      [name]
    )
  ).rows[0].id;
  await app.query("INSERT INTO assignment (initiative_id, org_id, award_amount) VALUES ($1, $2, 50000)", [init, mariaOrg]);
  const form = (
    await app.query(
      "INSERT INTO form_version (initiative_id, version, status, definition, source) SELECT $1, 1, 'draft', definition, 'manual' FROM form_version LIMIT 1 RETURNING id",
      [init]
    )
  ).rows[0].id;
  await app.query("SELECT app.publish_form($1)", [form]);
  return init;
}

describe("[BR-002][US-040] obligations follow the initiative fiscal year", () => {
  it("never pairs an initiative with a period from another fiscal year", async () => {
    const { rows } = await owner.query(
      `SELECT count(*)::int AS n FROM obligation o
       JOIN initiative i ON i.id = o.initiative_id
       WHERE o.fiscal_year_id <> i.fiscal_year_id`
    );
    expect(rows[0].n).toBe(0);
    const byYear = (
      await owner.query(
        `SELECT i.fiscal_year_id AS fy, o.period_id, count(*)::int AS n FROM obligation o JOIN initiative i ON i.id = o.initiative_id GROUP BY 1, 2 ORDER BY 1, 2`
      )
    ).rows;
    expect(byYear.map((r) => `${r.fy}:${r.period_id}`)).toEqual(["FY26:FY26-MY", "FY26:FY26-YE", "FY27:FY27-MY", "FY27:FY27-YE"]);
  });

  it("gives an initiative created in FY27 only FY27 periods in the organization's portal list", async () => {
    const result = await asUser(app, priya, async () => {
      const init = await addFy27Initiative("Adult Reading Circles");
      return (await app.query("SELECT period_id FROM obligation WHERE initiative_id = $1 ORDER BY due_on", [init])).rows.map((r) => r.period_id);
    });
    expect(result).toEqual(["FY27-MY", "FY27-YE"]);
  });

  it("keeps a new FY27 initiative out of FY26 Year-End reminders", async () => {
    const targets = await asUser(app, priya, async () => {
      await addFy27Initiative("Adult Reading Circles");
      await app.query("SELECT app.restore_reminder_defaults('FY26-YE')");
      return (await app.query("SELECT initiatives FROM app.reminder_targets('FY26-YE', '2026-10-01'::date)")).rows.map((r) => String(r.initiatives));
    });
    expect(targets.length).toBeGreaterThan(0);
    for (const names of targets) expect(names).not.toContain("Adult Reading Circles");
  });

  it("does not change FY26 or FY27 obligations when a later year is rolled over", async () => {
    const counts = async () =>
      (await app.query(`SELECT o.period_id, count(*)::int AS n FROM obligation o WHERE o.period_id IN ('FY26-MY', 'FY26-YE', 'FY27-MY', 'FY27-YE') GROUP BY 1 ORDER BY 1`)).rows;
    const result = await asUser(app, priya, async () => {
      const before = await counts();
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', '[]'::jsonb)");
      const after = await counts();
      const fy28 = (await app.query(`SELECT DISTINCT o.period_id FROM obligation o WHERE o.fiscal_year_id = 'FY28' ORDER BY 1`)).rows.map((r) => r.period_id);
      const stray = (
        await app.query(
          `SELECT count(*)::int AS n FROM obligation o JOIN initiative i ON i.id = o.initiative_id WHERE i.fiscal_year_id = 'FY28' AND o.period_id NOT LIKE 'FY28-%'`
        )
      ).rows[0].n;
      return { before, after, fy28, stray };
    });
    expect(result.after).toEqual(result.before);
    expect(result.fy28).toEqual(["FY28-MY", "FY28-YE"]);
    expect(result.stray).toBe(0);
  });

  it("lets the same organization see FY26 and FY27 reports side by side without cross-year rows", async () => {
    const rows = await asUser(app, maria, async () => {
      return (
        await app.query(
          `SELECT i.fiscal_year_id AS fy, o.period_id FROM obligation o JOIN initiative i ON i.id = o.initiative_id WHERE o.org_id = $1 ORDER BY 1, 2`,
          [mariaOrg]
        )
      ).rows;
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.period_id.startsWith(row.fy)).toBe(true);
  });
});

describe("[BR-002] Mid-Year and Year-End cover the fiscal year", () => {
  it("starts Year-End on the first day of the fiscal year and Mid-Year ends on December 31", async () => {
    const { rows } = await owner.query(
      `SELECT p.id, p.starts_on::text AS starts_on, p.ends_on::text AS ends_on, f.starts_on::text AS fy_start, f.ends_on::text AS fy_end
       FROM reporting_period p JOIN fiscal_year f ON f.id = p.fiscal_year_id ORDER BY p.due_on`
    );
    expect(rows.length).toBe(4);
    for (const row of rows) {
      expect(row.starts_on).toBe(row.fy_start);
      if (row.id.endsWith("-YE")) expect(row.ends_on).toBe(row.fy_end);
      else expect(row.ends_on.slice(5)).toBe("12-31");
    }
  });

  it("creates cumulative Year-End periods when a year is rolled over", async () => {
    const periods = await asUser(app, priya, async () => {
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', '[]'::jsonb)");
      return (await app.query("SELECT id, starts_on::text, ends_on::text, due_on::text FROM reporting_period WHERE fiscal_year_id = 'FY28' ORDER BY id")).rows;
    });
    expect(periods).toEqual([
      { id: "FY28-MY", starts_on: "2027-07-01", ends_on: "2027-12-31", due_on: "2028-01-31" },
      { id: "FY28-YE", starts_on: "2027-07-01", ends_on: "2028-06-30", due_on: "2028-09-30" },
    ]);
  });
});

describe("[US-001][US-009] award fields", () => {
  it("inherits the administering agency from the initiative", async () => {
    const agency = await asUser(app, priya, async () => {
      const init = await addFy27Initiative("Neighborhood Reading Hours");
      const parent = (await app.query("SELECT administering_agency FROM initiative WHERE id = $1", [init])).rows[0].administering_agency;
      const award = (await app.query("SELECT sponsoring_agency FROM assignment WHERE initiative_id = $1", [init])).rows[0].sponsoring_agency;
      return { parent, award };
    });
    expect(agency.parent).toBe("DYCD");
    expect(agency.award).toBe(agency.parent);
  });

  it("requires a registration date for registered contracts and a contract number", async () => {
    await owner.query("BEGIN");
    const code = await errorCode(() =>
      owner.query("UPDATE assignment SET contract_status = 'registered' WHERE id = (SELECT id FROM assignment WHERE contract_status = 'awaiting' LIMIT 1)")
    );
    await owner.query("ROLLBACK");
    expect(code).toBe("23514");
  });

  it("carries funding source and sponsors through a rollover", async () => {
    const result = await asUser(app, priya, async () => {
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', '[]'::jsonb)");
      return (
        await app.query(
          `SELECT count(*)::int AS awards,
                  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM assignment_sponsor s WHERE s.assignment_id = a.id))::int AS with_sponsor,
                  count(*) FILTER (WHERE a.sponsoring_agency IS NOT NULL)::int AS with_agency
           FROM assignment a JOIN initiative i ON i.id = a.initiative_id WHERE i.fiscal_year_id = 'FY28'`
        )
      ).rows[0];
    });
    expect(result.awards).toBeGreaterThan(0);
    expect(result.with_sponsor).toBe(result.awards);
    expect(result.with_agency).toBe(result.awards);
  });
});

describe("[US-001] initiative names are unique within a fiscal year", () => {
  it("rejects a second initiative with the same name in the same year and allows it in another", async () => {
    const outcome = await asUser(app, priya, async () => {
      const existing = (await app.query("SELECT name, category FROM initiative WHERE fiscal_year_id = 'FY27' LIMIT 1")).rows[0];
      await app.query("SAVEPOINT dup");
      const code = await errorCode(() =>
        app.query("INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding) VALUES ('CI-T-9001', upper($1), $2, 'Duplicate name test.', 'FY27', 0)", [existing.name, existing.category])
      );
      await app.query("ROLLBACK TO SAVEPOINT dup");
      return { code };
    });
    expect(outcome.code).toBe("23505");
    const shared = (
      await owner.query(`SELECT count(*)::int AS n FROM initiative a JOIN initiative b ON lower(b.name) = lower(a.name) AND b.fiscal_year_id = 'FY27' WHERE a.fiscal_year_id = 'FY26'`)
    ).rows[0].n;
    expect(shared).toBeGreaterThan(0);
  });
});
