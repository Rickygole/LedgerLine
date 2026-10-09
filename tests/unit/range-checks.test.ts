import { describe, expect, it } from "vitest";
import { buildDefinition, CATEGORY_METRICS } from "@/lib/forms/standard";
import { daysInPeriod, rangeIssues } from "@/lib/rules/ranges";

const period = { startsOn: "2026-01-01", endsOn: "2026-06-30" };
const food = buildDefinition("Food", CATEGORY_METRICS["Food Security"]);
const legal = buildDefinition("Legal", CATEGORY_METRICS["Legal Services"]);

describe("[LL-RANGE-DAYS] days cannot exceed the days in the period", () => {
  it("counts both ends of the period", () => {
    expect(daysInPeriod(period)).toBe(181);
    expect(daysInPeriod({ startsOn: "2026-07-01", endsOn: "2026-12-31" })).toBe(184);
  });

  it("blocks pantry days above the period length", () => {
    const issues = rangeIssues({ definition: food, answers: { pantry_days: "783" }, period });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ ruleId: "LL-RANGE-DAYS", severity: "block", field: "pantry_days" });
    expect(issues[0].message).toBe("Pantry distribution days cannot be more than the 181 days in this reporting period.");
  });

  it("accepts a count equal to the period length", () => {
    expect(rangeIssues({ definition: food, answers: { pantry_days: "181" }, period })).toEqual([]);
  });

  it("skips the check when the period is not known", () => {
    expect(rangeIssues({ definition: food, answers: { pantry_days: "783" } })).toEqual([]);
  });
});

describe("[LL-RANGE-SUBCOUNT] a sub-count cannot exceed the total", () => {
  it("blocks under-18 counts that add up to more than participants served", () => {
    const answers = { participants_actual: "50", served_youth: "Yes", youth_breakdown: [{ age_group: "5 to 9", count: "30" }, { age_group: "10 to 14", count: "30" }] };
    const issues = rangeIssues({ definition: legal, answers, period });
    expect(issues.find((i) => i.ruleId === "LL-RANGE-SUBCOUNT")).toMatchObject({ severity: "block", field: "youth_breakdown" });
  });

  it("accepts counts that add up to the total", () => {
    const answers = { participants_actual: "60", served_youth: "Yes", youth_breakdown: [{ age_group: "5 to 9", count: "30" }, { age_group: "10 to 14", count: "30" }] };
    expect(rangeIssues({ definition: legal, answers, period })).toEqual([]);
  });
});

describe("[LL-RANGE-SERVED][LL-RANGE-PAIR] soft warnings", () => {
  it("warns when served is more than twice the target", () => {
    const issues = rangeIssues({ definition: legal, answers: { participants_actual: "500", participants_target: "100" }, period });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warn");
  });

  it("warns when cases resolved exceed cases opened", () => {
    const issues = rangeIssues({ definition: legal, answers: { cases_resolved: "30", cases_opened: "20" }, period });
    expect(issues[0]).toMatchObject({ ruleId: "LL-RANGE-PAIR", severity: "warn" });
  });
});
