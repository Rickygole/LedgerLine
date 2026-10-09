import { describe, expect, it } from "vitest";
import { buildDefinition } from "@/lib/forms/standard";
import { EIN_NOT_ON_LIST, einMismatch, issuesBySection, reportIssues } from "@/lib/report/issues";
import { NAME_NOT_ON_LIST, identityProblem, nameMismatch } from "@/lib/rules/identity";
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

describe("[BR-023] legal name and EIN are checked against the master list", () => {
  const master = { orgEin: "00-1040217", orgName: "Mott Haven Youth Futures, Inc." };

  it("blocks a legal name that is not the master list name", () => {
    const issues = reportIssues({ definition, answers: { ...base, org_legal_name: "Totally Different Org LLC" }, budget: [], awardAmount: 85000, ...master });
    expect(issues.some((issue) => issue.field === "org_legal_name" && issue.severity === "block" && issue.message === NAME_NOT_ON_LIST)).toBe(true);
  });

  it("ignores case, spacing and punctuation differences in the legal name", () => {
    expect(nameMismatch("mott haven youth futures inc", master.orgName)).toBe(false);
    expect(nameMismatch("  Mott Haven  Youth Futures, Inc.", master.orgName)).toBe(false);
    expect(nameMismatch("Mott Haven Youth Futures", master.orgName)).toBe(true);
  });

  it("accepts the master list values", () => {
    const issues = reportIssues({ definition, answers: base, budget: [], awardAmount: 85000, ...master }).filter((issue) => issue.field.startsWith("org_"));
    expect(issues).toEqual([]);
  });

  it("refuses a correction that sets a non-master EIN or name", () => {
    const org = { legalName: master.orgName, ein: master.orgEin };
    expect(identityProblem("org_ein", "99-9999999", org)).toBe(EIN_NOT_ON_LIST);
    expect(identityProblem("org_legal_name", "Other Name", org)).toBe(NAME_NOT_ON_LIST);
    expect(identityProblem("org_ein", "001040217", org)).toBeNull();
    expect(identityProblem("contact_name", "Anyone", org)).toBeNull();
  });
});
