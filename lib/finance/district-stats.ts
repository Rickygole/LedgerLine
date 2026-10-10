import type { Tx } from "@/lib/db";
import { boroughLabel, DISTRICT_NUMBERS, districtInBorough } from "@/lib/geo/boroughs";
import type { ReportRow } from "@/lib/finance/review/types";

export type MapMode = "sponsor" | "location";

const DISTRICT_FUNDING = ["local", "delegation"];

export type Tally = { due: number; missing: number; waiting: number; accepted: number };

type DistrictStat = Tally & { district: number; member: string | null; boroughs: string };

export type DistrictStats = {
  mode: MapMode;
  districts: DistrictStat[];
  speaker: Tally;
  citywide: Tally;
  noDistrict: Tally;
  inDistricts: Tally;
  totalMissing: number;
};

type Row = Pick<ReportRow, "bucket" | "fundingSource" | "sponsors" | "councilDistrict"> & Partial<Pick<ReportRow, "borough">>;

const empty = (): Tally => ({ due: 0, missing: 0, waiting: 0, accepted: 0 });

function add(tally: Tally, row: Row) {
  tally.due += 1;
  if (row.bucket === "missing") tally.missing += 1;
  if (row.bucket === "submitted") tally.waiting += 1;
  if (row.bucket === "accepted") tally.accepted += 1;
}

export function parseMapMode(value: string | string[] | undefined): MapMode {
  const text = Array.isArray(value) ? value[0] : value;
  return text === "location" ? "location" : "sponsor";
}

export function sponsorDistricts(row: Pick<ReportRow, "fundingSource" | "sponsors">): number[] {
  if (!DISTRICT_FUNDING.includes(row.fundingSource)) return [];
  return [...new Set(row.sponsors.map((s) => s.district))];
}

export function matchesDistrict(row: Pick<ReportRow, "fundingSource" | "sponsors" | "councilDistrict">, district: string, by: MapMode | ""): boolean {
  if (by === "sponsor") return sponsorDistricts(row).some((d) => String(d) === district);
  return String(row.councilDistrict ?? "") === district;
}

export function districtStats(rows: Row[], mode: MapMode, members: Map<number, string>, borough = ""): DistrictStats {
  const byDistrict = new Map<number, Tally>(DISTRICT_NUMBERS.map((d) => [d, empty()]));
  const speaker = empty();
  const citywide = empty();
  const noDistrict = empty();
  const inDistricts = empty();

  for (const row of rows) {
    if (mode === "sponsor") {
      if (row.fundingSource === "speaker") {
        add(speaker, row);
        continue;
      }
      if (row.fundingSource === "citywide") {
        add(citywide, row);
        continue;
      }
      const districts = sponsorDistricts(row).filter((d) => byDistrict.has(d));
      if (districts.length === 0) {
        add(noDistrict, row);
        continue;
      }
      add(inDistricts, row);
      for (const d of districts) add(byDistrict.get(d)!, row);
    } else {
      const d = row.councilDistrict;
      if (d === null || !byDistrict.has(d)) {
        add(noDistrict, row);
        continue;
      }
      add(inDistricts, row);
      add(byDistrict.get(d)!, row);
    }
  }

  if (mode === "location" && borough) {
    const scoped = new Map<number, Tally>();
    for (const row of rows) {
      const d = row.councilDistrict;
      if (d === null || row.borough !== borough || !districtInBorough(d, borough)) continue;
      const tally = scoped.get(d) ?? empty();
      add(tally, row);
      scoped.set(d, tally);
    }
    for (const d of DISTRICT_NUMBERS) if (districtInBorough(d, borough)) byDistrict.set(d, scoped.get(d) ?? empty());
  }

  return {
    mode,
    districts: DISTRICT_NUMBERS.map((district) => ({ district, member: members.get(district) ?? null, boroughs: boroughLabel(district), ...byDistrict.get(district)! })),
    speaker,
    citywide,
    noDistrict,
    inDistricts,
    totalMissing: inDistricts.missing + speaker.missing + citywide.missing + noDistrict.missing,
  };
}

export function missingShare(missing: number, due: number): number {
  return due <= 0 ? 0 : Math.round((missing / due) * 100);
}

export function binFor(missing: number, due: number): 0 | 1 | 2 | 3 | 4 {
  if (missing <= 0 || due <= 0) return 0;
  const share = (missing / due) * 100;
  if (share < 10) return 1;
  if (share < 25) return 2;
  if (share < 50) return 3;
  return 4;
}

export function byMostMissing(a: DistrictStat, b: DistrictStat): number {
  return b.missing - a.missing || b.missing / Math.max(1, b.due) - a.missing / Math.max(1, a.due) || a.district - b.district;
}

export function rankDistricts(stats: DistrictStat[], borough: string, limit = 6): DistrictStat[] {
  return stats
    .filter((s) => s.due > 0 && (borough === "" || districtInBorough(s.district, borough)))
    .sort(byMostMissing)
    .slice(0, limit);
}

export async function loadCouncilMembers(tx: Tx): Promise<Map<number, string>> {
  const rows = await tx.query<{ district: number; full_name: string }>("SELECT district, full_name FROM council_member ORDER BY district");
  return new Map(rows.map((r) => [r.district, r.full_name]));
}
