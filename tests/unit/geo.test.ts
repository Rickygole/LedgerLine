import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOROUGH_SHAPES, COUNCIL_DISTRICT_SHAPES } from "@/lib/geo";

const BOROUGHS = ["Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
const dir = path.join(process.cwd(), "lib", "geo");

describe("council district geometry", () => {
  it("has 51 unique districts numbered 1 to 51", () => {
    const ids = COUNCIL_DISTRICT_SHAPES.map((d) => d.district).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 51 }, (_, i) => i + 1));
  });

  it("gives every district a borough, a path and a label inside the viewBox", () => {
    for (const d of COUNCIL_DISTRICT_SHAPES) {
      expect(BOROUGHS).toContain(d.borough);
      expect(d.path.startsWith("M")).toBe(true);
      expect(d.path.endsWith("Z")).toBe(true);
      expect(d.path.length).toBeGreaterThan(20);
      expect(d.labelX).toBeGreaterThanOrEqual(0);
      expect(d.labelX).toBeLessThanOrEqual(1000);
      expect(d.labelY).toBeGreaterThanOrEqual(0);
      expect(d.labelY).toBeLessThanOrEqual(1000);
    }
  });

  it("maps districts to boroughs by majority area", () => {
    const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const expected: Record<string, number[]> = {
      Manhattan: range(1, 10),
      Bronx: range(11, 18),
      Queens: range(19, 32),
      Brooklyn: range(33, 48),
      "Staten Island": range(49, 51),
    };
    for (const [borough, ids] of Object.entries(expected)) {
      const got = COUNCIL_DISTRICT_SHAPES.filter((d) => d.borough === borough)
        .map((d) => d.district)
        .sort((a, b) => a - b);
      expect(got).toEqual(ids);
    }
  });

  it("has one non-empty outline per borough", () => {
    expect(BOROUGH_SHAPES.map((b) => b.borough).sort()).toEqual([...BOROUGHS].sort());
    for (const b of BOROUGH_SHAPES) expect(b.path.length).toBeGreaterThan(20);
  });

  it("stays within the size budget", () => {
    const districts = statSync(path.join(dir, "council-districts.json")).size;
    const boroughs = statSync(path.join(dir, "boroughs.json")).size;
    expect(districts).toBeLessThan(80 * 1024);
    expect(boroughs).toBeLessThan(40 * 1024);
    expect(districts + boroughs).toBeLessThan(120 * 1024);
  });
});
