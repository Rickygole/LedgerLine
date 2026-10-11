import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import {
  cleanParams,
  countMatches,
  exportSummary,
  resultsHref,
  summarizeMatches,
  toSearch,
} from "@/lib/lifecycle/queries";
import { appUrl, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let daniel: string;
let periods: { id: string; dueOn: string }[];
const PERIOD = "FY26-YE";

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  daniel = await userId(owner, "daniel.cho");
  periods = (await owner.query("SELECT id, due_on::text AS due FROM reporting_period ORDER BY due_on")).rows.map(
    (r) => ({ id: r.id as string, dueOn: r.due as string }),
  );
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
    return await countMatches(asTx(app), cleanParams({ period: PERIOD, ...params }, periods));
  } finally {
    await app.query("ROLLBACK");
  }
}

async function expected(where: string, params: unknown[] = []): Promise<number> {
  const { rows } = await owner.query(
    `SELECT count(*)::int AS n FROM obligation ob
     JOIN assignment a ON a.id = ob.assignment_id
     JOIN organization o ON o.id = a.org_id
     JOIN initiative i ON i.id = a.initiative_id
     LEFT JOIN submission s ON s.id = ob.submission_id
     WHERE ob.period_id = '${PERIOD}' AND ${where}`,
    params,
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
    const category = (await owner.query("SELECT category FROM initiative GROUP BY 1 ORDER BY count(*) DESC LIMIT 1"))
      .rows[0].category as string;
    const combined = await count({ borough: "Brooklyn", category, award_max: "150000" });
    expect(combined).toBe(
      await expected("o.borough = 'Brooklyn' AND i.category = $1 AND a.award_amount <= 150000", [category]),
    );
    expect(combined).toBeLessThanOrEqual(await count({ borough: "Brooklyn" }));
  });

  it("drops unknown values and keeps the criteria in the link to the results", () => {
    const params = cleanParams({ borough: "Atlantis", award_min: "abc", status: "accepted", district: "99" }, [
      { id: PERIOD, dueOn: "2026-09-30" },
    ]);
    expect(params).toEqual({ period: "FY26-YE", status: "accepted" });
    expect(toSearch(params)).toBe("period=FY26-YE&status=accepted");
    expect(resultsHref(params)).toBe("/finance/submissions?period=FY26-YE&status=accepted");
  });
});

describe("[US-048][US-046] a query says how many of its matches the export includes", () => {
  async function summary(params: Record<string, string>) {
    await app.query("BEGIN");
    try {
      await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: daniel })]);
      return await summarizeMatches(asTx(app), cleanParams({ period: PERIOD, ...params }, periods));
    } finally {
      await app.query("ROLLBACK");
    }
  }

  it("counts only submitted, in review, returned and accepted reports as exportable", async () => {
    const all = await summary({});
    expect(all.matches).toBe(await expected("true"));
    expect(all.exportable).toBe(await expected("s.status IN ('submitted', 'under_review', 'returned', 'accepted')"));
    expect(all.exportable).toBeLessThan(all.matches);
  });

  it("matches the exportable count for a single status and says so in words", async () => {
    const accepted = await summary({ status: "accepted" });
    expect(accepted.exportable).toBe(accepted.matches);
    expect(exportSummary({ matches: 15, exportable: 13 })).toBe(
      "15 matches, 13 submitted reports included in the export",
    );
    expect(exportSummary({ matches: 1, exportable: 1 })).toBe("1 match, 1 submitted report included in the export");
  });
});
