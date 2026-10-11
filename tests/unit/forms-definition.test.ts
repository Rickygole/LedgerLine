import { describe, expect, it } from "vitest";
import { validateDefinition } from "@/lib/forms/editor/definition";
import { buildDefinition } from "@/lib/forms/standard";

describe("form definitions keep the budget rules", () => {
  const base = buildDefinition("Test report", []);
  const message = "Every form must keep the budget section, and the budget total must equal the award.";

  it("accepts the standard form", () => {
    expect(validateDefinition(base)).toEqual([]);
  });

  it("refuses to turn off the budget, the award rule or drop the budget section", () => {
    expect(validateDefinition({ ...base, budget: { ...base.budget, enabled: false } })).toContain(message);
    expect(validateDefinition({ ...base, budget: { ...base.budget, mustEqualAward: false } })).toContain(message);
    expect(
      validateDefinition({ ...base, sections: base.sections.filter((section) => section.kind !== "budget") }),
    ).toContain(message);
  });
});

describe("[US-003] a form cannot have two questions with the same label", () => {
  const base = buildDefinition("Test report", []);
  const first = base.sections.find((section) => section.kind === "questions")!;
  const duplicate = { ...first.questions[1], key: "copy_of_second", label: `  ${first.questions[0].label.toUpperCase()} ` };

  it("refuses a repeated label ignoring case and spacing", () => {
    const sections = base.sections.map((section) =>
      section === first ? { ...section, questions: [...section.questions, duplicate] } : section,
    );
    expect(validateDefinition({ ...base, sections })).toContain(
      `Two questions are labeled "${duplicate.label.trim()}". Give each question its own label.`,
    );
  });

  it("accepts a form where every label is its own", () => {
    expect(validateDefinition(base)).toEqual([]);
  });
});

describe("[US-003] library usage is counted for the current fiscal year", () => {
  it("leads with the current year and lists earlier years after it", async () => {
    const { usageParts } = await import("@/lib/forms/library");
    expect(usageParts({ FY26: 175, FY27: 175 }, "FY27")).toEqual({
      current: { year: "FY27", count: 175 },
      prior: [{ year: "FY26", count: 175 }],
    });
    expect(usageParts({ FY26: 3 }, "FY27")).toEqual({
      current: { year: "FY27", count: 0 },
      prior: [{ year: "FY26", count: 3 }],
    });
    expect(usageParts({}, null)).toEqual({ current: null, prior: [] });
  });
});
