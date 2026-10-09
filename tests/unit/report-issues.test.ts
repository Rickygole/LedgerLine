import { describe, expect, it } from "vitest";
import { buildDefinition } from "@/lib/forms/standard";
import { EIN_NOT_ON_LIST, einMismatch, issuesBySection, reportIssues } from "@/lib/report/issues";
import type { Answers } from "@/lib/rules/types";

const definition = buildDefinition("Test form", []);
const base: Answers = { org_legal_name: "Mott Haven Youth Futures, Inc.", org_ein: "00-1040217" };

describe("[BR-023][US-033] report EIN check", () => {
  it("accepts the organization's own EIN with or without the dash", () => {
    expect(einMismatch("00-1040217", "00-1040217")).toBe(false);
    expect(einMismatch("001040217", "00-1040217")).toBe(false);
  });

  it("flags a well-formed EIN that is not the organization's", () => {
    const issues = reportIssues({ definition, answers: { ...base, org_ein: "12-3456789" }, budget: [], awardAmount: 85000, orgEin: "00-1040217" });
    expect(issues.some((issue) => issue.field === "org_ein" && issue.message === EIN_NOT_ON_LIST)).toBe(true);
  });

  it("does not add a second EIN issue for a malformed value", () => {
    const issues = reportIssues({ definition, answers: { ...base, org_ein: "12" }, budget: [], awardAmount: 85000, orgEin: "00-1040217" });
    expect(issues.filter((issue) => issue.field === "org_ein")).toHaveLength(1);
  });
});

describe("[BR-022] report budget issues", () => {
  it("blocks an unbalanced budget and files it under the budget section", () => {
    const budget = [{ rowId: "r1", position: 1, category: "PS" as const, description: "Director", amount: 89200 }];
    const issues = reportIssues({ definition, answers: base, budget, awardAmount: 85000, orgEin: "00-1040217" });
    const grouped = issuesBySection(definition, issues);
    expect(grouped.budget?.[0].message).toBe("Total $89,200.00 must equal award $85,000.00 (over by $4,200.00).");
  });
});
