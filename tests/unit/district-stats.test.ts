import { describe, expect, it } from "vitest";
import { binFor, districtStats, matchesDistrict, rankDistricts } from "@/lib/finance/district-stats";
import { boroughLabel, boroughsForDistrict, districtInBorough } from "@/lib/geo/boroughs";
import { COUNCIL_DISTRICT_SHAPES } from "@/lib/geo";
import type { Bucket } from "@/lib/reporting";

type Row = {
  bucket: Bucket;
  fundingSource: string;
  sponsors: { district: number; name: string; amount: number }[];
  councilDistrict: number | null;
};

const sp = (...districts: number[]) =>
  districts.map((district) => ({ district, name: `Member ${district}`, amount: 1 }));
const members = new Map(Array.from({ length: 51 }, (_, i) => [i + 1, `Member ${i + 1}`] as [number, string]));

const rows: Row[] = [
  { bucket: "missing", fundingSource: "local", sponsors: sp(8), councilDistrict: 8 },
  { bucket: "missing", fundingSource: "delegation", sponsors: sp(8, 17, 17), councilDistrict: 17 },
  { bucket: "submitted", fundingSource: "local", sponsors: sp(22), councilDistrict: 22 },
  { bucket: "accepted", fundingSource: "local", sponsors: sp(22), councilDistrict: 22 },
  { bucket: "missing", fundingSource: "speaker", sponsors: sp(3), councilDistrict: 3 },
  { bucket: "missing", fundingSource: "citywide", sponsors: sp(40), councilDistrict: null },
  { bucket: "missing", fundingSource: "citywide", sponsors: [], councilDistrict: 40 },
  { bucket: "outstanding", fundingSource: "local", sponsors: [], councilDistrict: 1 },
];
const missing = rows.filter((r) => r.bucket === "missing").length;

describe("Council district map numbers", () => {
  it("covers all 51 districts with geometry", () => {
    expect(COUNCIL_DISTRICT_SHAPES).toHaveLength(51);
    const stats = districtStats(rows, "sponsor", members);
    expect(stats.districts.map((d) => d.district)).toEqual(Array.from({ length: 51 }, (_, i) => i + 1));
  });

  it("sponsor mode: distinct district reports plus Speaker, citywide and unassigned equal the Missing count", () => {
    const stats = districtStats(rows, "sponsor", members);
    expect(stats.inDistricts.missing + stats.speaker.missing + stats.citywide.missing + stats.noDistrict.missing).toBe(
      missing,
    );
    expect(stats.totalMissing).toBe(missing);
    expect(stats.speaker).toMatchObject({ due: 1, missing: 1 });
    expect(stats.citywide).toMatchObject({ due: 2, missing: 2 });
    const d8 = stats.districts.find((d) => d.district === 8)!;
    const d17 = stats.districts.find((d) => d.district === 17)!;
    expect(d8).toMatchObject({ due: 2, missing: 2, member: "Member 8", boroughs: "Manhattan and Bronx" });
    expect(d17).toMatchObject({ due: 1, missing: 1 });
    expect(stats.districts.find((d) => d.district === 22)).toMatchObject({
      due: 2,
      missing: 0,
      waiting: 1,
      accepted: 1,
    });
  });

  it("location mode: districts plus no district on file equal the Missing count exactly", () => {
    const stats = districtStats(rows, "location", members);
    const sum = stats.districts.reduce((n, d) => n + d.missing, 0) + stats.noDistrict.missing;
    expect(sum).toBe(missing);
    expect(stats.noDistrict).toMatchObject({ due: 1, missing: 1 });
  });

  it("filters submissions the same way the map counts them", () => {
    const sponsorHits = rows.filter((r) => matchesDistrict(r, "8", "sponsor") && r.bucket === "missing").length;
    expect(sponsorHits).toBe(districtStats(rows, "sponsor", members).districts[7].missing);
    const locationHits = rows.filter((r) => matchesDistrict(r, "40", "location")).length;
    expect(locationHits).toBe(districtStats(rows, "location", members).districts[39].due);
    expect(matchesDistrict(rows[4], "3", "sponsor")).toBe(false);
    expect(matchesDistrict(rows[0], "8", "")).toBe(true);
  });

  it("bins, ranks and places district 8 in both Manhattan and the Bronx", () => {
    const pairs: [number, number][] = [
      [0, 10],
      [1, 20],
      [1, 11],
      [1, 10],
      [2, 9],
      [6, 25],
      [3, 7],
      [1, 2],
      [2, 2],
      [3, 0],
    ];
    expect(pairs.map(([m, d]) => binFor(m, d))).toEqual([0, 1, 1, 2, 2, 2, 3, 4, 4, 0]);
    expect(boroughsForDistrict(8)).toEqual(["Manhattan", "Bronx"]);
    expect(districtInBorough(8, "Bronx")).toBe(true);
    expect(boroughLabel(50)).toBe("Staten Island");
    const ranked = rankDistricts(districtStats(rows, "sponsor", members).districts, "Bronx");
    expect(ranked.map((d) => d.district)).toEqual([8, 17]);
  });
});
