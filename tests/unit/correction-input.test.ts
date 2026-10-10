import { describe, expect, it } from "vitest";
import {
  budgetAudit,
  parseBudgetCorrection,
  parseTableCorrection,
  tableAsText,
} from "@/lib/finance/review/correction-input";
import { correctionChanges, correctionValueInWords } from "@/lib/finance/review/audit-words";
import { introducedBlockingIssuesFor } from "@/lib/rules/correction";
import type { BudgetLine, FormDefinition, Question } from "@/lib/rules/types";

const existing: BudgetLine[] = [
  { rowId: "a", position: 1, category: "PS", description: "Coordinator", amount: 600, actual: 550 },
  { rowId: "b", position: 2, category: "OTPS", description: "Supplies", amount: 400, actual: null },
];
const ids = () => "new-id";

describe("[US-045] budget correction input", () => {
  it("edits a line, keeps its actual spent and gives a new line a new id", () => {
    const result = parseBudgetCorrection(
      JSON.stringify([
        { rowId: "a", category: "OTPS", description: "Coordinator, 0.6 FTE", amount: "$650.00" },
        { rowId: "b", category: "OTPS", description: "Supplies", amount: "400" },
        { category: "PS", description: "Stipend", amount: "50.5" },
      ]),
      existing,
      ids,
      100,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({ rowId: "a", category: "OTPS", amount: 650, actual: 550, position: 1 });
    expect(result.value[2]).toMatchObject({ rowId: "new-id", amount: 50.5, actual: null, position: 3 });
  });

  it("removes a line when it is left out", () => {
    const result = parseBudgetCorrection(
      JSON.stringify([{ rowId: "a", category: "PS", description: "Coordinator", amount: "600" }]),
      existing,
      ids,
      100,
    );
    expect(result.ok && result.value.map((l) => l.rowId)).toEqual(["a"]);
  });

  it("rejects a blank description, a bad amount, a bad category and too many lines", () => {
    const run = (line: unknown, max = 100) => parseBudgetCorrection(JSON.stringify([line]), existing, ids, max);
    expect(run({ category: "PS", description: " ", amount: "5" })).toEqual({
      ok: false,
      message: "Line 1: enter a description.",
    });
    expect(run({ category: "PS", description: "x", amount: "twelve" }).ok).toBe(false);
    expect(run({ category: "PS", description: "x", amount: "1.234" }).ok).toBe(false);
    expect(run({ category: "PS", description: "x", amount: "-5" }).ok).toBe(false);
    expect(run({ category: "XX", description: "x", amount: "5" }).ok).toBe(false);
    expect(parseBudgetCorrection("[{},{}]", existing, ids, 1).ok).toBe(false);
    expect(parseBudgetCorrection("not json", existing, ids, 1).ok).toBe(false);
  });
});

const table: Question = {
  key: "youth_breakdown",
  label: "Youth by age group",
  type: "table",
  required: true,
  scope: "initiative",
  maxRows: 2,
  columns: [
    { key: "age_group", label: "Age group", type: "text" },
    { key: "count", label: "Youth", type: "integer" },
  ],
};

describe("[US-045] table correction input", () => {
  it("keeps only the configured columns and drops blank rows", () => {
    const result = parseTableCorrection(
      JSON.stringify([
        { age_group: " 5 to 9 ", count: "12", extra: "x" },
        { age_group: "", count: "" },
      ]),
      table,
    );
    expect(result).toEqual({ ok: true, value: [{ age_group: "5 to 9", count: "12" }] });
  });

  it("enforces the row limit", () => {
    const rows = JSON.stringify([{ age_group: "a" }, { age_group: "b" }, { age_group: "c" }]);
    expect(parseTableCorrection(rows, table).ok).toBe(false);
  });
});

describe("[US-045] a budget correction may not introduce a new blocking problem", () => {
  const definition: FormDefinition = {
    title: "Test",
    budget: { enabled: true, mustEqualAward: true, maxLines: 100 },
    sections: [{ key: "budget", title: "Budget", kind: "budget", questions: [] }],
  };
  const input = { definition, answers: {}, budget: existing, awardAmount: 1000 };

  it("allows a correction that keeps the budget balanced", () => {
    const next = [
      { ...existing[0], amount: 700 },
      { ...existing[1], amount: 300 },
    ];
    expect(introducedBlockingIssuesFor(input, { budget: next })).toEqual([]);
  });

  it("refuses a correction that unbalances a balanced budget", () => {
    const next = [{ ...existing[0], amount: 700 }, existing[1]];
    expect(introducedBlockingIssuesFor(input, { budget: next }).map((i) => i.ruleId)).toHaveLength(1);
  });

  it("refuses a new line with no description", () => {
    const next = [...existing, { rowId: "c", position: 3, category: "PS" as const, description: "", amount: 0 }];
    expect(introducedBlockingIssuesFor(input, { budget: next }).map((i) => i.field)).toEqual(["budget.c"]);
  });

  it("does not blame the correction for a budget that was already unbalanced", () => {
    const flawed = { ...input, awardAmount: 2000 };
    expect(introducedBlockingIssuesFor(flawed, { budget: [{ ...existing[0], amount: 650 }, existing[1]] })).toEqual([]);
  });
});

describe("[US-045] audit wording for budget and table corrections", () => {
  it("summarizes lines and lists what changed", () => {
    const before = budgetAudit(existing);
    const after = budgetAudit([
      { ...existing[0], amount: 650 },
      { rowId: "c", position: 2, category: "PS", description: "Stipend", amount: 50 },
    ]);
    expect(correctionValueInWords(before)).toBe("2 lines, $1,000.00");
    expect(correctionValueInWords([{ a: 1 }])).toBe("1 row");
    expect(correctionChanges(before, after)).toEqual([
      "Line 1: amount $600.00 to $650.00",
      "Added line 2: PS Stipend, $50.00",
      "Removed line 2: OTPS Supplies, $400.00",
    ]);
  });
});

describe("[US-045] table values compare as text", () => {
  it("treats stored numbers and typed text as the same value and ignores blank rows", () => {
    const stored = [
      { age_group: "Under 10", count: 1 },
      { age_group: "", count: null },
    ];
    expect(tableAsText(stored, table)).toEqual([{ age_group: "Under 10", count: "1" }]);
    expect(tableAsText(undefined, table)).toEqual([]);
  });
});
