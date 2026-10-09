import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { daysPastDue, isToday, todayInNewYork } from "@/lib/dates";
import { savedAtLabel } from "@/lib/report/format";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("[US-040] one source of today", () => {
  it("returns the pinned date when one is set and the New York date otherwise", () => {
    vi.stubEnv("DEMO_TODAY", "2026-10-14");
    expect(todayInNewYork()).toBe("2026-10-14");
    vi.stubEnv("DEMO_TODAY", "");
    expect(todayInNewYork()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("makes days past due, today checks and the saved label agree on the same day", () => {
    vi.stubEnv("DEMO_TODAY", "2026-10-09");
    expect(daysPastDue("2026-09-30")).toBe(9);
    expect(isToday("2026-10-09T14:37:00Z")).toBe(true);
    expect(isToday("2026-10-14T14:37:00Z")).toBe(false);
    expect(savedAtLabel("2026-10-09T20:56:00Z")).toBe("4:56 PM");
    vi.stubEnv("DEMO_TODAY", "2026-10-14");
    expect(daysPastDue("2026-09-30")).toBe(14);
    expect(savedAtLabel("2026-10-09T20:56:00Z")).toBe("Oct 9, 2026, 4:56 PM");
  });

  it("never reads the clock for a calendar date outside lib/dates.ts", () => {
    const root = path.resolve(__dirname, "../..");
    const allowed = new Set(["lib/dates.ts", "lib/ai/model.ts", "app/portal/reports/actions.ts"]);
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name)) {
          const relative = path.relative(root, full);
          if (allowed.has(relative)) continue;
          const text = readFileSync(full, "utf8");
          if (/new Date\(\)|Date\.now\(\)|Intl\.DateTimeFormat\([^)]*\)\.format\(new Date/.test(text)) found.push(relative);
        }
      }
    };
    for (const dir of ["app", "lib", "components"]) walk(path.join(root, dir));
    expect(found).toEqual([]);
  });
});
