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
