import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import { todayInNewYork } from "@/lib/dates";
import { districtStats, loadCouncilMembers, matchesDistrict } from "@/lib/finance/district-stats";
import { loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { countBuckets } from "@/lib/finance/review/derive";
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

describe("the district map reconciles with the dashboard Missing tile", () => {
  it("adds up for every reporting period in both map modes", async () => {
    await asUser(app, daniel, async () => {
      const periods = await loadPeriods(tx);
      const members = await loadCouncilMembers(tx);
      expect(members.size).toBe(51);
      for (const period of periods) {
        const rows = await loadReportRows(tx, period);
        const missing = countBuckets(rows).missing;
        const { rows: raw } = await owner.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM obligation WHERE period_id = $1 AND due_on < $2::date AND (submission_id IS NULL OR submission_status = 'draft')",
          [period.id, todayInNewYork()]
        );
        expect(missing, period.id).toBe(raw[0].n);

        const sponsor = districtStats(rows, "sponsor", members);
        expect(sponsor.inDistricts.missing + sponsor.speaker.missing + sponsor.citywide.missing + sponsor.noDistrict.missing, period.id).toBe(missing);

        const location = districtStats(rows, "location", members);
        expect(location.districts.reduce((n, d) => n + d.missing, 0) + location.noDistrict.missing, period.id).toBe(missing);

        for (const d of sponsor.districts) {
          const listed = rows.filter((r) => r.bucket === "missing" && matchesDistrict(r, String(d.district), "sponsor")).length;
          expect(listed, `${period.id} district ${d.district}`).toBe(d.missing);
        }
      }
    });
  });

  it("matches an independent SQL count of district funded missing reports", async () => {
    await asUser(app, daniel, async () => {
      const period = (await loadPeriods(tx)).find((p) => p.id === "FY26-YE")!;
      const rows = await loadReportRows(tx, period);
      const stats = districtStats(rows, "sponsor", await loadCouncilMembers(tx));
      const { rows: perDistrict } = await owner.query<{ district: number; missing: number }>(
        `SELECT sp.district, count(DISTINCT o.assignment_id) FILTER (WHERE o.due_on < $2::date AND (o.submission_id IS NULL OR o.submission_status = 'draft'))::int AS missing
         FROM obligation o JOIN assignment a ON a.id = o.assignment_id JOIN assignment_sponsor sp ON sp.assignment_id = a.id
         WHERE o.period_id = $1 AND a.funding_source IN ('local', 'delegation') GROUP BY sp.district`,
        [period.id, todayInNewYork()]
      );
      for (const row of perDistrict) expect(stats.districts[row.district - 1].missing, `district ${row.district}`).toBe(row.missing);
      const { rows: tiles } = await owner.query<{ funding_source: string; missing: number }>(
        `SELECT a.funding_source, count(*) FILTER (WHERE o.due_on < $2::date AND (o.submission_id IS NULL OR o.submission_status = 'draft'))::int AS missing
         FROM obligation o JOIN assignment a ON a.id = o.assignment_id WHERE o.period_id = $1 AND a.funding_source IN ('speaker', 'citywide') GROUP BY 1`,
        [period.id, todayInNewYork()]
      );
      expect(stats.speaker.missing).toBe(tiles.find((t) => t.funding_source === "speaker")?.missing ?? 0);
      expect(stats.citywide.missing).toBe(tiles.find((t) => t.funding_source === "citywide")?.missing ?? 0);
    });
  });
});
