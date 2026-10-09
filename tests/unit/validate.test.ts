import { describe, expect, it } from "vitest";
import { balanceMessage, blockingIssues, validateSubmission, visibleAnswers } from "@/lib/rules/validate";
import type { BudgetLine, FormDefinition } from "@/lib/rules/types";

const definition: FormDefinition = {
  title: "Test report",
  budget: { enabled: true, mustEqualAward: true, maxLines: 100 },
  sections: [
    {
      key: "contact",
      title: "Contact",
      kind: "questions",
      questions: [
        { key: "contact_phone", label: "Contact phone", type: "phone", required: true, scope: "standard" },
        { key: "org_ein", label: "EIN", type: "ein", required: true, scope: "standard" },
        { key: "narrative", label: "Program narrative", type: "textarea", required: true, scope: "standard", maxWords: 5 },
        { key: "served_youth", label: "Served youth under 18", type: "yesno", required: true, scope: "initiative" },
        { key: "youth_count", label: "Youth served", type: "integer", required: true, scope: "initiative", visibleWhen: { key: "served_youth", equals: "Yes" } },
        { key: "delivery", label: "Delivery model", type: "select", required: false, scope: "initiative", options: ["In person", "Remote", "Hybrid"] },
      ],
    },
    { key: "budget", title: "Budget", kind: "budget", questions: [] },
  ],
};

const line = (amount: number, position = 1): BudgetLine => ({ rowId: `r${position}`, position, category: "PS", description: "Coordinator", amount });

const good = {
  contact_phone: "212-555-0142",
  org_ein: "00-1234567",
  narrative: "We served many families.",
  served_youth: "No",
};

describe("[BR-022][US-027][US-028] budget must equal the award", () => {
  it("blocks when over the award and says by how much", () => {
    const issues = validateSubmission({ definition, answers: good, budget: [line(89200)], awardAmount: 85000 });
    const balance = issues.find((i) => i.ruleId === "BR-022");
    expect(balance?.severity).toBe("block");
    expect(balance?.message).toBe("Total $89,200.00 must equal award $85,000.00 (over by $4,200.00).");
  });

  it("blocks when under the award", () => {
    const issues = validateSubmission({ definition, answers: good, budget: [line(80000)], awardAmount: 85000 });
    expect(issues.find((i) => i.ruleId === "BR-022")?.message).toContain("under by $5,000.00");
  });

  it("passes when balanced to the cent across many lines", () => {
    const lines = Array.from({ length: 100 }, (_, i) => line(850, i + 1));
    expect(blockingIssues(validateSubmission({ definition, answers: good, budget: lines, awardAmount: 85000 }))).toEqual([]);
  });

  it("states balance in words", () => {
    expect(balanceMessage(85000, 85000)).toEqual({ balanced: true, message: "Balanced: total equals the award of $85,000.00." });
  });
});

describe("[BR-021][US-031] required fields", () => {
  it("blocks every missing required field", () => {
    const issues = validateSubmission({ definition, answers: {}, budget: [line(85000)], awardAmount: 85000 });
    const fields = issues.filter((i) => i.ruleId === "BR-021").map((i) => i.field);
    expect(fields).toEqual(["contact_phone", "org_ein", "narrative", "served_youth"]);
  });

  it("[US-006] enforces a branched question only when it is shown", () => {
    const hidden = validateSubmission({ definition, answers: good, budget: [line(85000)], awardAmount: 85000 });
    expect(hidden.some((i) => i.field === "youth_count")).toBe(false);
    const shown = validateSubmission({ definition, answers: { ...good, served_youth: "Yes" }, budget: [line(85000)], awardAmount: 85000 });
    expect(shown.find((i) => i.field === "youth_count")?.ruleId).toBe("BR-021");
  });
});

describe("[US-029][US-030][BR-023] types and lengths", () => {
  it("rejects a malformed EIN and phone with plain messages", () => {
    const issues = validateSubmission({
      definition,
      answers: { ...good, org_ein: "1234", contact_phone: "555-01" },
      budget: [line(85000)],
      awardAmount: 85000,
    });
    expect(issues.find((i) => i.field === "org_ein")?.message).toBe("EIN must be 9 digits, like 12-3456789.");
    expect(issues.find((i) => i.field === "contact_phone")?.message).toBe("Contact phone must be a 10-digit phone number.");
  });

  it("counts words against the limit", () => {
    const issues = validateSubmission({
      definition,
      answers: { ...good, narrative: "one two three four five six" },
      budget: [line(85000)],
      awardAmount: 85000,
    });
    expect(issues.find((i) => i.field === "narrative")?.message).toBe("Program narrative must be 5 words or fewer (now 6).");
  });

  it("[US-008] rejects a value outside the dropdown list", () => {
    const issues = validateSubmission({ definition, answers: { ...good, delivery: "By carrier pigeon" }, budget: [line(85000)], awardAmount: 85000 });
    expect(issues.find((i) => i.field === "delivery")?.ruleId).toBe("US-008");
  });
});

describe("[US-029] typed answers must hold a real value", () => {
  const typed: FormDefinition = {
    title: "Typed",
    budget: { enabled: false, mustEqualAward: false, maxLines: 10 },
    sections: [
      {
        key: "s",
        title: "S",
        kind: "questions",
        questions: [
          { key: "spent", label: "Spent", type: "currency", required: true, scope: "initiative" },
          { key: "share", label: "Share", type: "percent", required: true, scope: "initiative" },
          { key: "held_on", label: "Held on", type: "date", required: true, scope: "initiative" },
        ],
      },
    ],
  };
  const fields = (answers: Record<string, string>) => validateSubmission({ definition: typed, answers, budget: [], awardAmount: 0 }).map((i) => i.field);

  it("rejects symbols with no digits and calendar dates that do not exist", () => {
    expect(fields({ spent: "$", share: "%", held_on: "2025-02-30" })).toEqual(["spent", "share", "held_on"]);
    expect(fields({ spent: ".", share: "0x10", held_on: "2023-02-29" })).toEqual(["spent", "share", "held_on"]);
  });

  it("still accepts ordinary values", () => {
    expect(fields({ spent: "$1,250.00", share: "45%", held_on: "2024-02-29" })).toEqual([]);
    expect(fields({ spent: "1250", share: "12.5", held_on: "2025-12-31" })).toEqual([]);
  });
});

describe("visibleAnswers", () => {
  it("drops answers hidden by branching", () => {
    expect(visibleAnswers(definition, { ...good, youth_count: "40" })).toEqual(good);
    expect(visibleAnswers(definition, { ...good, served_youth: "Yes", youth_count: "40" })).toEqual({ ...good, served_youth: "Yes", youth_count: "40" });
  });
});

describe("[BR-021][US-031] a required table needs a filled row", () => {
  const tableForm: FormDefinition = {
    title: "Table report",
    budget: { enabled: false, mustEqualAward: false, maxLines: 10 },
    sections: [
      {
        key: "youth",
        title: "Youth",
        kind: "questions",
        questions: [
          {
            key: "ages",
            label: "Participants under 18 by age group",
            type: "table",
            required: true,
            scope: "initiative",
            columns: [
              { key: "age_group", label: "Age group", type: "text" },
              { key: "count", label: "Participants", type: "integer" },
            ],
          },
        ],
      },
    ],
  };
  const run = (rows: Array<Record<string, string | number | null>> | undefined) =>
    validateSubmission({ definition: tableForm, answers: rows === undefined ? {} : { ages: rows }, budget: [], awardAmount: 0 });

  it("blocks a table with no rows", () => {
    expect(run([])[0]?.message).toBe("Fill in the participants under 18 by age group table.");
  });

  it("blocks a table whose only row is empty", () => {
    const issues = run([{ age_group: "", count: "" }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toBe("Fill in the participants under 18 by age group table.");
  });

  it("blocks a table of several empty rows", () => {
    expect(run([{ age_group: " ", count: null }, { age_group: "", count: "" }])).toHaveLength(1);
  });

  it("blocks a half filled row and names the missing cell", () => {
    const issues = run([{ age_group: "5 to 9", count: "" }]);
    expect(issues[0].message).toBe("Participants under 18 by age group, row 1: fill in Participants, or remove the row.");
  });

  it("ignores empty rows next to a complete row", () => {
    expect(run([{ age_group: "5 to 9", count: "12" }, { age_group: "", count: "" }])).toEqual([]);
  });

  it("flags a half filled row even when the table is optional", () => {
    const optional: FormDefinition = { ...tableForm, sections: [{ ...tableForm.sections[0], questions: [{ ...tableForm.sections[0].questions[0], required: false }] }] };
    const issues = validateSubmission({ definition: optional, answers: { ages: [{ age_group: "x", count: "" }] }, budget: [], awardAmount: 0 });
    expect(issues).toHaveLength(1);
    expect(validateSubmission({ definition: optional, answers: { ages: [{ age_group: "", count: "" }] }, budget: [], awardAmount: 0 })).toEqual([]);
  });
});
