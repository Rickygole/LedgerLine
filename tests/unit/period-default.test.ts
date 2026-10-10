import { describe, expect, it } from "vitest";
import { cycleTimeline } from "@/lib/finance/dashboard";
import { defaultPeriodId } from "@/lib/finance/review/filters";

const periods = [
  { id: "FY27-MY", label: "FY27 Mid-Year", dueOn: "2027-01-31", fiscalYearId: "FY27" },
  { id: "FY27-YE", label: "FY27 Year-End", dueOn: "2027-09-30", fiscalYearId: "FY27" },
  { id: "FY27-X1", label: "Spring Site Audit", dueOn: "2027-03-31", fiscalYearId: "FY27", custom: true },
];

describe("[US-002] a report one initiative requires does not take over the shared views", () => {
  it("does not pick a custom report as the default period of the dashboard and lists", () => {
    expect(defaultPeriodId(periods, "2027-04-15")).toBe("FY27-MY");
    expect(defaultPeriodId(periods, "2027-10-01")).toBe("FY27-YE");
  });

  it("falls back to a custom period only when there is no shared one", () => {
    expect(defaultPeriodId([periods[2]], "2027-04-15")).toBe("FY27-X1");
  });

  it("leaves custom reports off the fiscal year timeline", () => {
    const marks = cycleTimeline("FY27", periods).marks.map((m) => m.label);
    expect(marks.some((label) => label.includes("Spring Site Audit"))).toBe(false);
    expect(marks).toContain("Mid-Year due");
  });
});
