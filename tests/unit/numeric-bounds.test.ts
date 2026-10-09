import { describe, expect, it } from "vitest";
import { amountBoundsProblem, numericProblem } from "@/lib/rules/bounds";
import { blockingIssues, validateSubmission } from "@/lib/rules/validate";
import type { BudgetLine, FormDefinition } from "@/lib/rules/types";

describe("[US-029] integer counts", () => {
  it("rejects negatives", () => {
    expect(numericProblem("integer", "-5", "Participants targeted")).toBe("Participants targeted cannot be negative.");
  });

  it("accepts the bounds 0 and 10,000,000 and rejects one more", () => {
    expect(numericProblem("integer", "0", "Sites")).toBeNull();
    expect(numericProblem("integer", "10000000", "Sites")).toBeNull();
    expect(numericProblem("integer", "10000001", "Sites")).toBe("Sites must be 10,000,000 or less.");
  });

  it("rejects values that would lose precision", () => {
    expect(numericProblem("integer", "99999999999999999999999", "Sites")).toBe("Sites must be 10,000,000 or less.");
    expect(numericProblem("integer", "1.5", "Sites")).toBe("Sites must be a whole number.");
  });
});

describe("[US-029] currency amounts", () => {
  it("accepts up to 999,999,999.99 and rejects more", () => {
    expect(numericProblem("currency", "$999,999,999.99", "Cost")).toBeNull();
    expect(numericProblem("currency", "1000000000", "Cost")).toBe("Cost must be $999,999,999.99 or less.");
  });

  it("rejects negatives and a third decimal place", () => {
    expect(numericProblem("currency", "-5000", "Cost")).toBe("Cost cannot be negative.");
    expect(numericProblem("currency", "10.001", "Cost")).toBe("Cost can have at most 2 decimal places.");
  });

  it("checks budget amounts in cents", () => {
    expect(amountBoundsProblem(0.1 + 0.2, "Amount")).toBeNull();
    expect(amountBoundsProblem(-1, "Amount")).toBe("Amount cannot be negative.");
    expect(amountBoundsProblem(1_000_000_000, "Amount")).toBe("Amount must be $999,999,999.99 or less.");
  });
});

describe("[US-029] percentages", () => {
  it("accepts 0 to 100 and rejects values outside it or with long fractions", () => {
    expect(numericProblem("percent", "0", "Completion")).toBeNull();
    expect(numericProblem("percent", "100%", "Completion")).toBeNull();
    expect(numericProblem("percent", "100.5", "Completion")).toBe("Completion must be a percentage between 0 and 100.");
    expect(numericProblem("percent", "0.0000001", "Completion")).toBe("Completion can have at most 2 decimal places.");
    expect(numericProblem("percent", "-3", "Completion")).toBe("Completion cannot be negative.");
  });
});

const definition: FormDefinition = {
  title: "Bounds",
  budget: { enabled: true, mustEqualAward: true, maxLines: 100 },
  sections: [
    {
      key: "main",
      title: "Main",
      kind: "questions",
      questions: [
        { key: "served", label: "Participants served", type: "integer", required: true, scope: "standard" },
        {
          key: "ages",
          label: "Ages",
          type: "table",
          required: false,
          scope: "standard",
          columns: [
            { key: "group", label: "Age group", type: "text" },
            { key: "count", label: "Participants", type: "integer" },
          ],
        },
      ],
    },
    { key: "budget", title: "Budget", kind: "budget", questions: [] },
  ],
};

const line = (amount: number, actual?: number | null): BudgetLine => ({ rowId: "r1", position: 1, category: "PS", description: "Staff", amount, actual });

describe("[US-029][BR-022] submit re-validates bounds", () => {
  it("blocks a negative table cell", () => {
    const issues = validateSubmission({ definition, answers: { served: "5", ages: [{ group: "5 to 9", count: "-4" }] }, budget: [line(100)], awardAmount: 100 });
    expect(issues.some((i) => i.field === "ages" && i.message.includes("cannot be negative"))).toBe(true);
  });

  it("blocks a negative budget line even when the total balances", () => {
    const budget: BudgetLine[] = [line(105000), { ...line(-20000), rowId: "r2", position: 2 }];
    const issues = blockingIssues(validateSubmission({ definition, answers: { served: "5" }, budget, awardAmount: 85000 }));
    expect(issues.some((i) => i.message === "Line 2: the amount cannot be negative.")).toBe(true);
  });

  it("blocks a negative actual spent value", () => {
    const issues = blockingIssues(validateSubmission({ definition, answers: { served: "5" }, budget: [line(100, -1)], awardAmount: 100 }));
    expect(issues.some((i) => i.message === "Line 1: actual spent cannot be negative.")).toBe(true);
  });

  it("states the line limit with the count", () => {
    const lines = Array.from({ length: 101 }, (_, i) => ({ ...line(1), rowId: `r${i}`, position: i + 1 }));
    const issues = validateSubmission({ definition, answers: { served: "5" }, budget: lines, awardAmount: 101 });
    expect(issues.find((i) => i.ruleId === "BR-008")?.message).toBe("The budget can have at most 100 lines. This budget has 101.");
  });
});
