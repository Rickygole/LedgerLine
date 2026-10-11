import { describe, expect, it } from "vitest";
import { buildDefinition } from "@/lib/forms/standard";
import { formatEin, normalizeEinAnswers } from "@/lib/rules/identity";
import { displayScalar, plainTextReport } from "@/lib/report/format";
import { buildReportPdf } from "@/lib/report/pdf";
import { buildSnapshot } from "@/lib/snapshot";
import { pdfText } from "./pdf-text";

const definition = buildDefinition("Youth Services", []);
const einQuestion = definition.sections.flatMap((s) => s.questions).find((q) => q.key === "org_ein")!;

describe("[BR-023] EIN answers are stored and shown as NN-NNNNNNN", () => {
  it("adds the dash to nine digits and leaves everything else as typed", () => {
    expect(formatEin("123456789")).toBe("12-3456789");
    expect(formatEin(" 12 3456789 ")).toBe("12-3456789");
    expect(formatEin("12-3456789")).toBe("12-3456789");
    expect(formatEin("12345")).toBe("12345");
    expect(formatEin("12-34567890")).toBe("12-34567890");
    expect(formatEin("ab123456789")).toBe("ab123456789");
  });

  it("normalizes only EIN-type answers before they are saved or exported", () => {
    const answers = normalizeEinAnswers(definition, { org_ein: "123456789", contact_phone: "2125550142" });
    expect(answers).toEqual({ org_ein: "12-3456789", contact_phone: "2125550142" });
  });

  it("shows the dash in every rendering, even for an answer stored without it", async () => {
    expect(displayScalar(einQuestion, "123456789")).toBe("12-3456789");
    const body = plainTextReport({
      title: "Youth Services",
      referenceNo: "LL-26YE-12345",
      periodLabel: "FY26 Year-End",
      orgName: "Harbor Youth Alliance",
      ein: "12-3456789",
      awardAmount: 1000,
      definition,
      answers: { org_ein: "123456789" },
      budget: [],
      attachments: [],
    });
    expect(body).toContain("Employer Identification Number (EIN): 12-3456789");
    const bytes = await buildReportPdf({
      initiativeName: "Youth Services",
      periodLabel: "FY27 Year-End",
      referenceNo: "LL-26YE-00002",
      revision: 1,
      revisionKind: "submit",
      revisionReason: null,
      revisionActor: null,
      submittedAt: "2026-10-01T14:00:00Z",
      submittedByName: "Maria Santos",
      orgName: "Harbor Youth Alliance",
      ein: "12-3456789",
      awardAmount: 1000,
      definition,
      snapshot: buildSnapshot({
        formVersionId: "fv",
        answers: { org_ein: "123456789" },
        budget: [],
        attachments: [],
      }),
    });
    const lines = (await pdfText(bytes)).split("\n");
    expect(lines.filter((line) => line.includes("12-3456789")).length).toBeGreaterThanOrEqual(2);
    expect(lines.some((line) => line.includes("123456789"))).toBe(false);
  });
});
