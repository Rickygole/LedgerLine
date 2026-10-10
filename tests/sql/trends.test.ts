import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import { fillMonths, monthLabel, monthlySubmissions, sharePercent, submissionShareByGroup } from "@/lib/finance/trends";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

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

const tx: Tx = {
  async query(sql, params) {
    return (await app.query(sql, params)).rows;
  },
  async one(sql, params) {
    return (await app.query(sql, params)).rows[0] ?? null;
  },
};

describe("[US-050] trend and comparison data follows the selected criteria", () => {
  it("fills quiet months so a trend line has no gaps", () => {
    const filled = fillMonths([
      { month: "2026-01", onTime: 5, late: 1 },
      { month: "2026-04", onTime: 2, late: 0 },
    ]);
    expect(filled.map((p) => [p.month, p.total])).toEqual([
      ["2026-01", 6],
      ["2026-02", 0],
      ["2026-03", 0],
      ["2026-04", 2],
    ]);
    expect(fillMonths([])).toEqual([]);
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(sharePercent(1, 3)).toBe(33.3);
    expect(sharePercent(0, 0)).toBe(0);
  });

  it("totals every submitted report across months, and narrows when a category or borough is chosen", async () => {
    await asUser(app, daniel, async () => {
      const all = await monthlySubmissions(tx, { category: "", borough: "" });
      const submitted = (await owner.query("SELECT count(*)::int AS n FROM submission WHERE submitted_at IS NOT NULL"))
        .rows[0].n;
      expect(all.reduce((sum, p) => sum + p.total, 0)).toBe(submitted);
      expect(all.length).toBeGreaterThan(6);
      expect(all.some((p) => p.late > 0)).toBe(true);
      expect(all.some((p) => p.onTime > 0)).toBe(true);

      const youth = await monthlySubmissions(tx, { category: "Youth Services", borough: "" });
      const bronx = await monthlySubmissions(tx, { category: "", borough: "Bronx" });
      const both = await monthlySubmissions(tx, { category: "Youth Services", borough: "Bronx" });
      const sum = (points: { total: number }[]) => points.reduce((s, p) => s + p.total, 0);
      expect(sum(youth)).toBeGreaterThan(0);
      expect(sum(youth)).toBeLessThan(sum(all));
      expect(sum(bronx)).toBeLessThan(sum(all));
      expect(sum(both)).toBeLessThanOrEqual(Math.min(sum(youth), sum(bronx)));
      expect(JSON.stringify(youth)).not.toBe(JSON.stringify(all));
      expect(await monthlySubmissions(tx, { category: "Not a category", borough: "" })).toEqual([]);
    });
  });

  it("compares groups for a reporting period and changes with the period and the filters", async () => {
    await asUser(app, daniel, async () => {
      const byCategory = await submissionShareByGroup(tx, {
        category: "",
        borough: "",
        period: "FY26-YE",
        compare: "category",
      });
      const byBorough = await submissionShareByGroup(tx, {
        category: "",
        borough: "",
        period: "FY26-YE",
        compare: "borough",
      });
      expect(byCategory.length).toBe(12);
      expect(byBorough.length).toBeGreaterThanOrEqual(4);
      const due = (await owner.query("SELECT count(*)::int AS n FROM obligation WHERE period_id = 'FY26-YE'")).rows[0]
        .n;
      expect(byCategory.reduce((s, g) => s + g.due, 0)).toBe(due);
      expect(byBorough.reduce((s, g) => s + g.due, 0)).toBe(due);
      for (const group of byCategory) {
        expect(group.share).toBeGreaterThanOrEqual(0);
        expect(group.share).toBeLessThanOrEqual(100);
        expect(group.share).toBe(sharePercent(group.submitted, group.due));
      }
      const sorted = [...byCategory].sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
      expect(byCategory.map((g) => g.name)).toEqual(sorted.map((g) => g.name));

      const filtered = await submissionShareByGroup(tx, {
        category: "Health",
        borough: "",
        period: "FY26-YE",
        compare: "category",
      });
      expect(filtered.map((g) => g.name)).toEqual(["Health"]);
      const current = await submissionShareByGroup(tx, {
        category: "",
        borough: "",
        period: "FY27-YE",
        compare: "category",
      });
      expect(JSON.stringify(current)).not.toBe(JSON.stringify(byCategory));
    });
  });
});
