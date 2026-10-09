import { describe, expect, it } from "vitest";
import { blockingIssues, validateSubmission } from "@/lib/rules/validate";
import { VARIANCE_NOTE_KEY, lineVariance, needsVarianceNote, spendIssues, spendSummary } from "@/lib/rules/spend";
import { buildSnapshot } from "@/lib/snapshot";
import type { BudgetLine, FormDefinition } from "@/lib/rules/types";

const definition: FormDefinition = {
  title: "Spend",
  budget: { enabled: true, mustEqualAward: true, maxLines: 100 },
  sections: [{ key: "budget", title: "Budget", kind: "budget", questions: [] }],
};

const line = (position: number, amount: number, actual: number | null = null): BudgetLine => ({ rowId: `r${position}`, position, category: "PS", description: `Line ${position}`, amount, actual });

describe("[BR-022] approved budget must still equal the award", () => {
  it("stays blocking when actual spent is entered and the approved total is short", () => {
    const issues = validateSubmission({ definition, answers: {}, budget: [line(1, 80000, 80000)], awardAmount: 85000 });
    expect(issues.find((i) => i.ruleId === "BR-022")?.severity).toBe("block");
  });

  it("does not depend on actual spent when the approved total balances", () => {
    const budget = [line(1, 50000, 10000), line(2, 35000, 5000)];
    expect(blockingIssues(validateSubmission({ definition, answers: {}, budget, awardAmount: 85000 }))).toEqual([]);
  });
});

describe("[LL-ACTUAL] actual spent summary", () => {
  const budget = [line(1, 50000, 40000), line(2, 35000, 30000)];

  it("totals actual spent, variance and unspent balance in cents", () => {
    expect(spendSummary(budget, 85000)).toEqual({ entered: true, approved: 85000, actual: 70000, variance: 15000, unspent: 15000, unspentPercent: 17.65 });
  });

  it("reports a line variance only when actual spent was entered", () => {
    expect(lineVariance(budget[0])).toBe(10000);
    expect(lineVariance(line(3, 100))).toBeNull();
  });

  it("is not entered when every actual is blank", () => {
    expect(spendSummary([line(1, 100)], 100).entered).toBe(false);
  });

  it("warns, without blocking, when no actual spent was entered", () => {
    const issues = spendIssues({ lines: [line(1, 100)], award: 100, answers: {}, phase: "submit" });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warn");
  });
});

describe("[LL-VARIANCE] underspend above 10 percent needs an explanation", () => {
  const under = [line(1, 85000, 70000)];

  it("is a warning while editing", () => {
    const issues = spendIssues({ lines: under, award: 85000, answers: {}, phase: "edit" });
    expect(issues.find((i) => i.ruleId === "LL-VARIANCE")?.severity).toBe("warn");
  });

  it("blocks only the missing explanation at submit", () => {
    const issues = spendIssues({ lines: under, award: 85000, answers: {}, phase: "submit" });
    const blocking = blockingIssues(issues);
    expect(blocking).toHaveLength(1);
    expect(blocking[0].field).toBe(VARIANCE_NOTE_KEY);
    expect(blocking[0].message).toBe("17.6% of the award is unspent. Explain why in the variance explanation.");
  });

  it("passes once a real explanation is written", () => {
    const answers = { [VARIANCE_NOTE_KEY]: "Two staff positions were vacant until March." };
    expect(blockingIssues(spendIssues({ lines: under, award: 85000, answers, phase: "submit" }))).toEqual([]);
  });

  it("does not trigger at exactly 10 percent", () => {
    expect(needsVarianceNote([line(1, 100000, 90000)], 100000)).toBe(false);
    expect(needsVarianceNote([line(1, 100000, 89999.99)], 100000)).toBe(true);
  });

  it("rejects a one character explanation", () => {
    const issues = spendIssues({ lines: under, award: 85000, answers: { [VARIANCE_NOTE_KEY]: "x" }, phase: "submit" });
    expect(blockingIssues(issues)).toHaveLength(1);
  });
});

describe("[LL-ACTUAL] snapshot keeps actual spent", () => {
  it("includes actual spent only for lines that have it", () => {
    const snapshot = buildSnapshot({ formVersionId: "f", answers: {}, budget: [line(1, 100, 40), line(2, 50)], attachments: [] });
    expect(snapshot.budget).toEqual([
      { actual: 40, amount: 100, category: "PS", description: "Line 1", position: 1 },
      { amount: 50, category: "PS", description: "Line 2", position: 2 },
    ]);
  });
});
