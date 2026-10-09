import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import { cleanParams, countMatches, DEFAULT_PERIOD, resultsHref, toSearch } from "@/lib/lifecycle/queries";
import { appUrl, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let daniel: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  daniel = await userId(owner, "daniel.cho");
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

async function count(params: Record<string, string>): Promise<number> {
  await app.query("BEGIN");
  try {
    await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: daniel })]);
    const periods = (await app.query("SELECT id FROM reporting_period")).rows.map((r) => r.id as string);
    return await countMatches(asTx(app), cleanParams(params, periods));
  } finally {
    await app.query("ROLLBACK");
  }
}

async function expected(where: string, params: unknown[] = []): Promise<number> {
  const { rows } = await owner.query(
    `SELECT count(*)::int AS n FROM assignment a
     JOIN organization o ON o.id = a.org_id
     JOIN initiative i ON i.id = a.initiative_id AND i.status = 'active'
     LEFT JOIN submission s ON s.assignment_id = a.id AND s.period_id = '${DEFAULT_PERIOD}'
     WHERE (s.id IS NOT NULL OR EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')) AND ${where}`,
    params
  );
  return rows[0].n;
}

describe("[US-048] finance builds queries from selected criteria", () => {
  it("returns the same number of reports as an independent count for each criterion", async () => {
    expect(await count({})).toBe(await expected("true"));
    expect(await count({ borough: "Bronx" })).toBe(await expected("o.borough = 'Bronx'"));
    expect(await count({ status: "accepted" })).toBe(await expected("s.status = 'accepted'"));
    expect(await count({ award_min: "100000" })).toBe(await expected("a.award_amount >= 100000"));
  });

  it("narrows the result when criteria are combined", async () => {
    const category = (await owner.query("SELECT category FROM initiative GROUP BY 1 ORDER BY count(*) DESC LIMIT 1")).rows[0].category as string;
    const combined = await count({ borough: "Brooklyn", category, award_max: "150000" });
    expect(combined).toBe(await expected("o.borough = 'Brooklyn' AND i.category = $1 AND a.award_amount <= 150000", [category]));
    expect(combined).toBeLessThanOrEqual(await count({ borough: "Brooklyn" }));
  });

  it("drops unknown values and keeps the criteria in the link to the results", () => {
    const params = cleanParams({ borough: "Atlantis", award_min: "abc", status: "accepted", district: "99" }, ["FY26-YE"]);
    expect(params).toEqual({ period: "FY26-YE", status: "accepted" });
    expect(toSearch(params)).toBe("period=FY26-YE&status=accepted");
    expect(resultsHref(params)).toBe("/finance/submissions?period=FY26-YE&status=accepted");
  });
});
