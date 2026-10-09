import { describe, expect, it } from "vitest";
import { requiredMessage } from "@/lib/rules/validate";

describe("[BR-021] required field messages read as plain instructions", () => {
  it("asks yes or no questions without folding them into a sentence", () => {
    expect(requiredMessage({ label: "Did this program serve participants under 18?", type: "yesno" })).toBe("Answer Yes or No: Did this program serve participants under 18?");
  });

  it("uses a verb that fits the field type", () => {
    expect(requiredMessage({ label: "Primary delivery model", type: "select" })).toBe("Choose a primary delivery model.");
    expect(requiredMessage({ label: "Job placements", type: "integer" })).toBe("Enter the number of job placements.");
    expect(requiredMessage({ label: "Number of program sites", type: "integer" })).toBe("Enter the number of program sites.");
    expect(requiredMessage({ label: "Completion rate", type: "percent" })).toBe("Enter the completion rate as a percentage.");
    expect(requiredMessage({ label: "Participants under 18 by age group", type: "table" })).toBe("Fill in the participants under 18 by age group table.");
  });

  it("keeps proper nouns and acronyms intact", () => {
    expect(requiredMessage({ label: "Employer Identification Number (EIN)", type: "ein" })).toBe("Enter the Employer Identification Number (EIN).");
  });

  it("never ends with a question mark followed by a period", () => {
    for (const type of ["text", "yesno", "select", "integer"] as const) {
      expect(requiredMessage({ label: "Did you finish?", type })).not.toMatch(/\?\./);
    }
  });
});
