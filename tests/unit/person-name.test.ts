import { describe, expect, it } from "vitest";
import { personNameProblem } from "@/lib/rules/person-name";
import { certificationIssues } from "@/lib/rules/certify";
import { validateSubmission } from "@/lib/rules/validate";
import type { FormDefinition } from "@/lib/rules/types";

describe("[US-035] person names accept real names and refuse markup and symbols", () => {
  it.each([
    "Maria Santos",
    "Zoë Ñúñez",
    "Siobhan O'Brien-Smith",
    "Dr. J. R. Cho",
    "Marie-Claire D’Souza",
    "José Ángel García Márquez",
    "Li",
    "Nguyễn Thị Hạnh",
    "Anna Maria von Trapp Jr.",
  ])("accepts %s", (name) => {
    expect(personNameProblem(name, "full name")).toBeNull();
  });

  it.each([
    "<script>alert(1)</script> Zoë Ñúñez 🎉",
    "Robert'); DROP TABLE users;--",
    "Maria 2nd",
    "R2D2",
    "...",
    "- -",
    "a@b.org",
    "Maria\u0000Santos",
  ])("refuses %s", (name) => {
    expect(personNameProblem(name, "full name")).toMatch(/Use only letters|at least 2|Enter/);
  });

  it("refuses an empty, one character or overlong name with a plain message", () => {
    expect(personNameProblem("   ", "full name")).toBe("Enter the full name.");
    expect(personNameProblem("A", "full name")).toBe("The full name must be at least 2 characters.");
    expect(personNameProblem("A".repeat(121), "full name")).toBe("The full name must be 120 characters or fewer.");
  });

  it("applies to the person certifying a report", () => {
    const issues = certificationIssues({ accepted: true, name: "<b>Maria</b>", title: "Director" });
    expect(issues.map((i) => i.field)).toEqual(["certifier_name"]);
    expect(certificationIssues({ accepted: true, name: "Maria O'Neil", title: "Director" })).toEqual([]);
  });

  it("applies to the report contact name", () => {
    const definition: FormDefinition = {
      title: "t",
      budget: { enabled: false, mustEqualAward: false, maxLines: 5 },
      sections: [
        {
          key: "c",
          title: "Contact",
          kind: "questions",
          questions: [
            { key: "contact_name", label: "Report contact name", type: "text", required: true, scope: "standard" },
          ],
        },
      ],
    };
    expect(
      validateSubmission({ definition, answers: { contact_name: "Maria Santos" }, budget: [], awardAmount: 0 }),
    ).toEqual([]);
    expect(
      validateSubmission({ definition, answers: { contact_name: "<script>x</script>" }, budget: [], awardAmount: 0 })[0]
        .message,
    ).toContain("Use only letters");
  });
});
