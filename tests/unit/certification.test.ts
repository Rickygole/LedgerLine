import { describe, expect, it } from "vitest";
import { CERTIFICATION_STATEMENT, certificationIssues, certificationNote } from "@/lib/rules/certify";
import { plainTextReport } from "@/lib/report/format";
import { buildDefinition } from "@/lib/forms/standard";
import { buildSnapshot } from "@/lib/snapshot";

describe("[LL-CERT] certification is required before submit", () => {
  it("blocks when the box is not checked", () => {
    const issues = certificationIssues({ accepted: false, name: "Maria Santos", title: "Program Director" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: "certification", severity: "block", message: "Check the box to certify that this report is accurate and complete." });
  });

  it("blocks when no certification is sent at all", () => {
    expect(certificationIssues(undefined).map((i) => i.field)).toEqual(["certification", "certifier_name", "certifier_title"]);
  });

  it("blocks a blank name or title", () => {
    const fields = certificationIssues({ accepted: true, name: " ", title: "" }).map((i) => i.field);
    expect(fields).toEqual(["certifier_name", "certifier_title"]);
  });

  it("passes with the box checked, a name and a title", () => {
    expect(certificationIssues({ accepted: true, name: "Maria Santos", title: "Program Director" })).toEqual([]);
  });

  it("writes the audit note from the certifier", () => {
    expect(certificationNote({ name: "Maria Santos", title: "Program Director" })).toBe("Certified accurate and complete by Maria Santos, Program Director");
  });
});

describe("[LL-CERT] certification is stored with the revision", () => {
  const certification = { statement: CERTIFICATION_STATEMENT, name: "Maria Santos", title: "Program Director", certifiedAt: "2026-10-14T15:00:00.000Z" };

  it("is part of the snapshot", () => {
    const snapshot = buildSnapshot({ formVersionId: "f", answers: {}, budget: [], attachments: [], certification });
    expect(snapshot.certification).toEqual(certification);
  });

  it("leaves older snapshots unchanged when there is none", () => {
    expect(Object.keys(buildSnapshot({ formVersionId: "f", answers: {}, budget: [], attachments: [] }))).toEqual(["answers", "attachments", "budget", "formVersionId"]);
  });

  it("appears in the confirmation email", () => {
    const body = plainTextReport({
      title: "Youth Mentoring",
      referenceNo: "LL-26YE-10001",
      periodLabel: "FY26 Year-End",
      orgName: "Mott Haven Youth Futures, Inc.",
      ein: "00-1040217",
      awardAmount: 100,
      definition: buildDefinition("Test", []),
      answers: {},
      budget: [{ position: 1, category: "PS", description: "Staff", amount: 100, actual: 60 }],
      attachments: [],
      certification,
    });
    expect(body).toContain("CERTIFICATION");
    expect(body).toContain("Maria Santos, Program Director");
    expect(body).toContain("Staff: $100.00, actual spent $60.00");
    expect(body).toContain("Unspent balance: $40.00 (40.0% of the award)");
  });
});
