import { describe, expect, it } from "vitest";
import { introducedBlockingIssues } from "@/lib/rules/correction";
import type { BudgetLine, FormDefinition } from "@/lib/rules/types";

const definition: FormDefinition = {
  title: "Test report",
  budget: { enabled: true, mustEqualAward: true, maxLines: 100 },
  sections: [
    {
      key: "main",
      title: "Main",
      kind: "questions",
      questions: [
        { key: "contact_name", label: "Contact name", type: "text", required: true, scope: "standard" },
        { key: "served_youth", label: "Served youth", type: "yesno", required: true, scope: "initiative" },
        {
          key: "youth_count",
          label: "Youth served",
          type: "integer",
          required: true,
          scope: "initiative",
          visibleWhen: { key: "served_youth", equals: "Yes" },
        },
        {
          key: "youth_breakdown",
          label: "Youth by age group",
          type: "table",
          required: true,
          scope: "initiative",
          visibleWhen: { key: "served_youth", equals: "Yes" },
          columns: [{ key: "age_group", label: "Age group", type: "text" }],
        },
      ],
    },
    { key: "budget", title: "Budget", kind: "budget", questions: [] },
  ],
};

const budget: BudgetLine[] = [{ rowId: "r1", position: 1, category: "PS", description: "Staff", amount: 1000 }];
const accepted = { contact_name: "Maria Santos", served_youth: "No" };
const input = { definition, answers: accepted, budget, awardAmount: 1000 };

describe("[US-045] a correction may not leave the report with a new blocking problem", () => {
  it("refuses a change that makes a required, empty question visible", () => {
    const introduced = introducedBlockingIssues(input, "served_youth", "Yes");
    expect(introduced.map((issue) => issue.field).sort()).toEqual(["youth_breakdown", "youth_count"]);
  });

  it("allows a change that introduces no new blocking problem", () => {
    expect(introducedBlockingIssues(input, "contact_name", "Maria S. Santos")).toEqual([]);
  });

  it("does not blame the correction for a problem the report already had", () => {
    const flawed = { ...input, answers: { served_youth: "No" } };
    expect(introducedBlockingIssues(flawed, "served_youth", "No")).toEqual([]);
    expect(introducedBlockingIssues(flawed, "contact_name", "Maria")).toEqual([]);
  });

  it("allows a change that removes a requirement", () => {
    const yes = {
      ...input,
      answers: { ...accepted, served_youth: "Yes", youth_count: "4", youth_breakdown: [{ age_group: "13 to 17" }] },
    };
    expect(introducedBlockingIssues(yes, "served_youth", "No")).toEqual([]);
  });
});
