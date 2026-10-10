import { describe, expect, it } from "vitest";
import { removeQuestion, validateDefinition } from "@/lib/forms/editor/definition";
import type { Answers, FormDefinition, GroupSumRule, Question } from "@/lib/rules/types";
import { blockingIssues, validateSubmission } from "@/lib/rules/validate";

const base = { enabled: false, mustEqualAward: false, maxLines: 100 };

const number = (key: string, label: string, type: Question["type"] = "integer"): Question => ({
  key,
  label,
  type,
  required: false,
  scope: "initiative",
});

function form(questions: Question[], sumRules?: GroupSumRule[]): FormDefinition {
  return {
    title: "Fixture",
    budget: base,
    sumRules,
    sections: [{ key: "s", title: "S", kind: "questions", questions }],
  };
}

function check(definition: FormDefinition, answers: Answers, award = 0) {
  return blockingIssues(validateSubmission({ definition, answers, budget: [], awardAmount: award }));
}

const ageTable: Question = {
  key: "ages",
  label: "Participants by age group",
  type: "table",
  required: false,
  scope: "initiative",
  maxRows: 6,
  columns: [
    { key: "group", label: "Age group", type: "text" },
    { key: "share", label: "Share of participants", type: "percent" },
  ],
  sumRule: { column: "share", target: 100 },
};

describe("[US-027] a table column can be required to add up to a fixed number", () => {
  it("accepts rows that add up to the target", () => {
    const rows = [
      { group: "Under 12", share: "40" },
      { group: "12 to 17", share: "60" },
    ];
    expect(check(form([ageTable]), { ages: rows })).toEqual([]);
  });

  it("names the table, the column and the difference when the rows fall short", () => {
    const rows = [
      { group: "Under 12", share: "40" },
      { group: "12 to 17", share: "55" },
    ];
    const issues = check(form([ageTable]), { ages: rows });
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe("US-027");
    expect(issues[0].field).toBe("ages");
    expect(issues[0].message).toBe(
      "Participants by age group: the Share of participants column adds up to 95%, but it must add up to 100% (5% under).",
    );
  });

  it("reports the overage when the rows add up to more than the target", () => {
    const rows = [
      { group: "A", share: "70" },
      { group: "B", share: "45.5" },
    ];
    expect(check(form([ageTable]), { ages: rows })[0].message).toContain("15.5% over");
  });

  it("leaves an empty optional table alone", () => {
    expect(check(form([ageTable]), {})).toEqual([]);
  });

  it("can require a dollar column to add up to the award", () => {
    const spend: Question = {
      ...ageTable,
      key: "spend",
      label: "Spending by site",
      columns: [
        { key: "site", label: "Site", type: "text" },
        { key: "cost", label: "Cost", type: "currency" },
      ],
      sumRule: { column: "cost", target: "award" },
    };
    const rows = [
      { site: "North", cost: "30000" },
      { site: "South", cost: "19000.50" },
    ];
    const issues = check(form([spend]), { spend: rows }, 50000);
    expect(issues[0].message).toBe(
      "Spending by site: the Cost column adds up to $49,000.50, but it must add up to the award of $50,000.00 ($999.50 under).",
    );
    expect(check(form([spend]), { spend: [...rows, { site: "East", cost: "999.50" }] }, 50000)).toEqual([]);
  });
});

describe("[US-027] a group of number questions can be required to add up to a value", () => {
  const questions = [
    number("served_north", "Served in the north"),
    number("served_south", "Served in the south"),
    number("served_east", "Served in the east"),
  ];
  const rule: GroupSumRule = {
    key: "sum_rule_1",
    fields: ["served_north", "served_south", "served_east"],
    target: 100,
  };

  it("passes when the answers add up and fails with the field names and the gap when they do not", () => {
    const definition = form(questions, [rule]);
    expect(check(definition, { served_north: "40", served_south: "30", served_east: "30" })).toEqual([]);
    const issues = check(definition, { served_north: "40", served_south: "30", served_east: "20" });
    expect(issues).toHaveLength(1);
    expect(issues[0].ruleId).toBe("US-027");
    expect(issues[0].field).toBe("served_north");
    expect(issues[0].message).toBe(
      "Served in the north, Served in the south and Served in the east must add up to 100. They add up to 90 (10 under).",
    );
  });

  it("treats a blank member as zero once any member is answered and ignores a group nobody has answered", () => {
    const definition = form(questions, [rule]);
    expect(check(definition, {})).toEqual([]);
    expect(check(definition, { served_north: "100" })).toEqual([]);
    expect(check(definition, { served_north: "60" })[0].message).toContain("(40 under)");
  });

  it("can target the award for dollar questions", () => {
    const dollars = [number("grant_a", "Grant A", "currency"), number("grant_b", "Grant B", "currency")];
    const definition = form(dollars, [{ key: "sum_rule_1", fields: ["grant_a", "grant_b"], target: "award" }]);
    expect(check(definition, { grant_a: "1000", grant_b: "500" }, 1500)).toEqual([]);
    expect(check(definition, { grant_a: "1000", grant_b: "700" }, 1500)[0].message).toBe(
      "Grant A and Grant B must add up to the award of $1,500.00. They add up to $1,700.00 ($200.00 over).",
    );
  });

  it("skips members hidden by a follow-up condition", () => {
    const gate: Question = { ...number("any", "Any other sites", "yesno"), required: false };
    const hidden: Question = {
      ...number("served_west", "Served in the west"),
      visibleWhen: { key: "any", equals: "Yes" },
    };
    const definition = form(
      [gate, questions[0], questions[1], hidden],
      [{ key: "sum_rule_1", fields: ["served_north", "served_south", "served_west"], target: 100 }],
    );
    expect(check(definition, { any: "No", served_north: "50", served_south: "50", served_west: "9" })).toEqual([]);
    expect(check(definition, { any: "Yes", served_north: "50", served_south: "50", served_west: "9" })).toHaveLength(1);
  });
});

describe("[US-027] the form editor only saves sum rules that can be checked", () => {
  const standard = (questions: Question[], rules?: GroupSumRule[]): FormDefinition => ({
    ...form(questions, rules),
    sections: [
      { key: "s", title: "S", kind: "questions", questions },
      { key: "budget", title: "Budget", kind: "budget", questions: [] },
    ],
    budget: { enabled: true, mustEqualAward: true, maxLines: 100 },
  });
  const a = number("part_a", "A");
  const b = number("part_b", "B");

  it("accepts a valid group rule and a valid table rule", () => {
    expect(
      validateDefinition(standard([a, b], [{ key: "sum_rule_1", fields: ["part_a", "part_b"], target: 100 }])),
    ).toEqual([]);
    expect(validateDefinition(standard([ageTable]))).toEqual([]);
  });

  it("refuses a rule with one question, a text question, mixed types, a missing question or a bad target", () => {
    const text = number("part_t", "T", "text");
    const money = number("part_m", "M", "currency");
    const rules = (fields: string[], target: GroupSumRule["target"] = 10): GroupSumRule[] => [
      { key: "sum_rule_1", fields, target },
    ];
    expect(validateDefinition(standard([a, b], rules(["part_a"])))).toContain(
      '"Sum rule sum_rule_1" needs at least two number questions to add up.',
    );
    expect(validateDefinition(standard([a, text], rules(["part_a", "part_t"])))).toContain(
      '"Sum rule sum_rule_1" can only add up number, whole number, dollar and percent questions.',
    );
    expect(validateDefinition(standard([a, money], rules(["part_a", "part_m"])))).toContain(
      '"Sum rule sum_rule_1" must add up questions of one answer type.',
    );
    expect(validateDefinition(standard([a, b], rules(["part_a", "gone"])))).toContain(
      '"Sum rule sum_rule_1" refers to a question that is not on the form.',
    );
    expect(validateDefinition(standard([a, b], rules(["part_a", "part_b"], -1)))).toContain(
      '"Sum rule sum_rule_1" needs a target of zero or more, or the award.',
    );
    expect(validateDefinition(standard([a, b], rules(["part_a", "part_b"], "award")))).toContain(
      '"Sum rule sum_rule_1" can only add up to the award when every question is a dollar amount.',
    );
  });

  it("refuses a table rule on a text column", () => {
    const bad = { ...ageTable, sumRule: { column: "group", target: 100 as const } };
    expect(validateDefinition(standard([bad]))).toContain(
      '"Participants by age group" can only add up a numeric column.',
    );
  });

  it("drops a group rule when removing a question leaves it with fewer than two", () => {
    const definition = standard([a, b], [{ key: "sum_rule_1", fields: ["part_a", "part_b"], target: 100 }]);
    expect(removeQuestion(definition, "part_b").sumRules).toBeUndefined();
  });
});
