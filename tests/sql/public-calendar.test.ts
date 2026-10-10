import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, asUser, connect, ownerUrl } from "./helpers";

let owner: Client;
let app: Client;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

type Row = { kind: string; id: string; label: string; due_on: Date | null };

describe("public calendar for the start page", () => {
  it("returns the fiscal year containing the date and every period due inside it without a session", async () => {
    const rows = await asUser(
      app,
      null,
      async () => (await app.query<Row>("SELECT kind, id, label, due_on FROM app.public_calendar('2026-10-14')")).rows,
    );
    const expected = await owner.query<{ id: string }>(
      `SELECT rp.id FROM reporting_period rp, fiscal_year f
       WHERE '2026-10-14' BETWEEN f.starts_on AND f.ends_on
         AND (rp.fiscal_year_id = f.id OR rp.due_on BETWEEN f.starts_on AND f.ends_on)
       ORDER BY rp.id`,
    );
    expect(rows.filter((r) => r.kind === "fiscal_year").map((r) => r.id)).toEqual(["FY27"]);
    expect(
      rows
        .filter((r) => r.kind === "period")
        .map((r) => r.id)
        .sort(),
    ).toEqual(expected.rows.map((r) => r.id));
    expect(rows.find((r) => r.id === "FY26-YE")?.label).toBe("FY26 Year-End");
  });

  it("returns nothing for a date outside every fiscal year", async () => {
    const rows = await asUser(
      app,
      null,
      async () => (await app.query("SELECT * FROM app.public_calendar('1990-01-01')")).rows,
    );
    expect(rows).toEqual([]);
  });
});
