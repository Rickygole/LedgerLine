import { describe, expect, it } from "vitest";
import { buildDefinition } from "@/lib/forms/standard";
import { plainTextReport } from "@/lib/report/format";

describe("confirmation email body", () => {
  it("includes every answer, the budget table and totals", () => {
    const body = plainTextReport({
      title: "Youth Mentoring Networks",
      referenceNo: "LL-26YE-12345",
      periodLabel: "FY26 Year-End",
      orgName: "Mott Haven Youth Futures, Inc.",
      ein: "00-1040217",
      awardAmount: 1000,
      definition: buildDefinition("t", []),
      answers: { contact_name: "Maria Santos", served_youth: "Yes", youth_breakdown: [{ age_group: "13 to 17", count: "98" }] },
      budget: [{ position: 1, category: "PS", description: "Director", amount: 1000 }],
      attachments: [{ filename: "roster.pdf", bytes: 2048 }],
    });
    expect(body).toContain("Report contact name: Maria Santos");
    expect(body).toContain("Age group: 13 to 17; Participants: 98");
    expect(body).toContain("1. [PS] Director: $1,000.00");
    expect(body).toContain("Total: $1,000.00");
    expect(body).toContain("Balanced");
    expect(body).toContain("roster.pdf (2 KB)");
  });
});
