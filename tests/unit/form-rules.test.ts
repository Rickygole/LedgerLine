import { describe, expect, it } from "vitest";
import { buildDefinition, STANDARD_QUESTIONS } from "@/lib/forms/standard";
import type { BudgetLine, FieldType, FormDefinition, Question } from "@/lib/rules/types";
import { balanceMessage, blockingIssues, validateSubmission } from "@/lib/rules/validate";

const line = (amount: number, position: number): BudgetLine => ({ rowId: `r${position}`, position, category: position % 2 ? "PS" : "OTPS", description: `Line ${position}`, amount });

function formWith(questions: Question[], budget = { enabled: false, mustEqualAward: false, maxLines: 100 }): FormDefinition {
  return { title: "Fixture", budget, sections: [{ key: "s", title: "S", kind: "questions", questions }] };
}

const q = (key: string, type: FieldType, extra: Partial<Question> = {}): Question => ({ key, label: key, type, required: true, scope: "initiative", ...extra });

function problems(question: Question, value: string): string[] {
  return validateSubmission({ definition: formWith([question]), answers: { [question.key]: value }, budget: [], awardAmount: 0 }).map((i) => i.field);
}

describe("[BR-008] a budget can have up to 100 lines", () => {
  const definition = buildDefinition("Cap", []);
  const answers = Object.fromEntries(
    STANDARD_QUESTIONS.filter((x) => x.required && x.type !== "table").map((x) => [x.key, x.type === "ein" ? "00-1234567" : x.type === "email" ? "a@b.org" : x.type === "phone" ? "718-555-0100" : x.type === "integer" ? "5" : x.type === "yesno" ? "No" : x.options ? x.options[0] : "text"])
  );

  it("accepts exactly 100 lines that add up to the award", () => {
    const lines = Array.from({ length: 100 }, (_, i) => line(10, i + 1));
    expect(blockingIssues(validateSubmission({ definition, answers, budget: lines, awardAmount: 1000 }))).toEqual([]);
  });

  it("blocks the 101st line and says what the limit is", () => {
    const lines = Array.from({ length: 101 }, (_, i) => line(10, i + 1));
    const issues = validateSubmission({ definition, answers, budget: lines, awardAmount: 1010 });
    expect(issues.find((i) => i.ruleId === "BR-008")?.message).toBe("The budget can have at most 100 lines. This budget has 101.");
  });
});

describe("[US-005] field types cover counts, money, percentages, dates, contacts, choices and narrative", () => {
  it("checks counts, money, percentages, dates, contacts, choices and narrative length", () => {
    expect(problems(q("a", "integer"), "12")).toEqual([]);
    expect(problems(q("a", "integer"), "12.5")).toEqual(["a"]);
    expect(problems(q("a", "currency"), "1,250.50")).toEqual([]);
    expect(problems(q("a", "currency"), "lots")).toEqual(["a"]);
    expect(problems(q("a", "percent"), "86%")).toEqual([]);
    expect(problems(q("a", "percent"), "140")).toEqual(["a"]);
    expect(problems(q("a", "date"), "2026-06-30")).toEqual([]);
    expect(problems(q("a", "date"), "06/30/2026")).toEqual(["a"]);
    expect(problems(q("a", "email"), "name@example.org")).toEqual([]);
    expect(problems(q("a", "email"), "name@")).toEqual(["a"]);
    expect(problems(q("a", "phone"), "(718) 555-0142")).toEqual([]);
    expect(problems(q("a", "phone"), "555-0142")).toEqual(["a"]);
    expect(problems(q("a", "yesno"), "Yes")).toEqual([]);
    expect(problems(q("a", "yesno"), "Maybe")).toEqual(["a"]);
    expect(problems(q("a", "textarea", { maxWords: 3 }), "one two three")).toEqual([]);
    expect(problems(q("a", "textarea", { maxWords: 3 }), "one two three four")).toEqual(["a"]);
  });

  it("includes performance counts, a budget section and narrative questions in the standard form", () => {
    const definition = buildDefinition("Standard", []);
    const kinds = definition.sections.map((s) => s.kind);
    expect(kinds).toContain("budget");
    const types = new Set(definition.sections.flatMap((s) => s.questions.map((x) => x.type)));
    expect(types.has("integer")).toBe(true);
    expect(types.has("textarea")).toBe(true);
  });
});

describe("[BR-003] a report combines performance, financial and narrative content", () => {
  it("has a performance section, a narrative section and a budget section in that order", () => {
    const keys = buildDefinition("Standard", []).sections.map((s) => s.key);
    expect(keys.indexOf("performance")).toBeLessThan(keys.indexOf("narrative"));
    expect(keys.indexOf("narrative")).toBeLessThan(keys.indexOf("budget"));
    expect(keys).toContain("organization");
  });
});

describe("[US-004][BR-004] forms mix shared standard questions with initiative-specific ones", () => {
  it("marks library questions as standard and adds initiative questions beside them", () => {
    const own = q("tutoring_hours", "integer");
    const definition = buildDefinition("Tutoring", [own]);
    const performance = definition.sections.find((s) => s.key === "performance")!;
    expect(performance.questions.some((x) => x.scope === "standard")).toBe(true);
    expect(performance.questions.find((x) => x.key === "tutoring_hours")?.scope).toBe("initiative");
    const all = definition.sections.flatMap((s) => s.questions.map((x) => x.key));
    expect(new Set(all).size).toBe(all.length);
  });

  it("gives two initiatives the same standard questions", () => {
    const a = buildDefinition("A", [q("a_only", "integer")]);
    const b = buildDefinition("B", [q("b_only", "integer")]);
    const standard = (d: FormDefinition) => d.sections.flatMap((s) => s.questions).filter((x) => x.scope === "standard").map((x) => x.key);
    expect(standard(a)).toEqual(standard(b));
  });
});

describe("[US-007] a question can contain a table to complete", () => {
  const table = q("age_table", "table", { maxRows: 2, columns: [{ key: "age", label: "Age group", type: "text" }, { key: "n", label: "Participants", type: "integer" }] });

  it("accepts a table within its row limit", () => {
    const rows = [{ age: "5 to 12", n: 10 }, { age: "13 to 17", n: 8 }];
    const issues = validateSubmission({ definition: formWith([table]), answers: { age_table: rows }, budget: [], awardAmount: 0 });
    expect(issues).toEqual([]);
  });

  it("blocks a table with more rows than allowed", () => {
    const rows = [{ age: "a", n: 1 }, { age: "b", n: 1 }, { age: "c", n: 1 }];
    const issues = validateSubmission({ definition: formWith([table]), answers: { age_table: rows }, budget: [], awardAmount: 0 });
    expect(issues[0].message).toBe("age_table can have at most 2 rows.");
  });

  it("requires the table when it is required and empty", () => {
    const issues = validateSubmission({ definition: formWith([table]), answers: { age_table: [] }, budget: [], awardAmount: 0 });
    expect(issues[0].ruleId).toBe("BR-021");
  });
});

describe("[US-035] error messages say exactly what to fix", () => {
  it("names the field, the problem and the amount to change", () => {
    expect(problems(q("contact_email", "email", { label: "Report contact email" }), "x")).toEqual(["contact_email"]);
    const issues = validateSubmission({ definition: formWith([q("e", "email", { label: "Report contact email" })]), answers: { e: "x" }, budget: [], awardAmount: 0 });
    expect(issues[0].message).toBe("Report contact email must be an email address, like name@example.org.");
    const length = validateSubmission({ definition: formWith([q("n", "textarea", { label: "Narrative", maxWords: 2 })]), answers: { n: "a b c d" }, budget: [], awardAmount: 0 });
    expect(length[0].message).toBe("Narrative must be 2 words or fewer (now 4).");
    expect(balanceMessage(79000.5, 85000).message).toBe("Total $79,000.50 must equal award $85,000.00 (under by $5,999.50).");
  });
});
