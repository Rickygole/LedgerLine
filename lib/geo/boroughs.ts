import { BOROUGHS } from "@/lib/domain";
import type { GeoBorough } from "./index";

export const GEO_BOROUGHS: GeoBorough[] = [...BOROUGHS];

const RANGES: [GeoBorough, number, number][] = [
  ["Manhattan", 1, 10],
  ["Bronx", 11, 18],
  ["Queens", 19, 32],
  ["Brooklyn", 33, 48],
  ["Staten Island", 49, 51],
];

const SHARED: Record<number, GeoBorough[]> = { 8: ["Manhattan", "Bronx"] };

export function boroughsForDistrict(district: number): GeoBorough[] {
  if (SHARED[district]) return SHARED[district];
  const hit = RANGES.find(([, from, to]) => district >= from && district <= to);
  return hit ? [hit[0]] : [];
}

export function boroughLabel(district: number): string {
  const list = boroughsForDistrict(district);
  return list.length === 2 ? `${list[0]} and ${list[1]}` : (list[0] ?? "");
}

export function districtInBorough(district: number, borough: string): boolean {
  return boroughsForDistrict(district).includes(borough as GeoBorough);
}

export function isGeoBorough(value: string): value is GeoBorough {
  return (GEO_BOROUGHS as string[]).includes(value);
}

export const DISTRICT_NUMBERS = Array.from({ length: 51 }, (_, i) => i + 1);
