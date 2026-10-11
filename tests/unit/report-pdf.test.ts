import { describe, expect, it } from "vitest";
import { buildDefinition } from "@/lib/forms/standard";
import { buildReportPdf, pdfFilename } from "@/lib/report/pdf";
import { buildSnapshot } from "@/lib/snapshot";
import type { Question } from "@/lib/rules/types";
import { pdfPages, pdfText } from "./pdf-text";

const tableQuestion: Question = {
  key: "activities",
  label: "Activities delivered",
  type: "table",
  required: false,
  scope: "initiative",
  columns: [
    { key: "name", label: "Activity", type: "text" },
    { key: "count", label: "Sessions", type: "integer" },
  ],
};

describe("[US-021] report PDF", () => {
  it("contains the answers, tables, budget subtotals, attachments and identifiers", async () => {
    const definition = buildDefinition("Youth Services", [tableQuestion]);
    const snapshot = buildSnapshot({
      formVersionId: "fv",
      answers: { activities: [{ name: "Tutoring", count: "12" }], org_legal_name: "Harbor Youth Alliance" },
      budget: [
        { rowId: "1", position: 1, category: "PS", description: "Program Coordinator, 0.6 FTE", amount: 40000 },
        { rowId: "2", position: 2, category: "OTPS", description: "Supplies", amount: 10000.5 },
      ],
      attachments: [{ path: "p/a.pdf", filename: "budget-remaining.xlsx", bytes: 2048, mime: "application/pdf" }],
    });
    const bytes = await buildReportPdf({
      initiativeName: "Youth Services",
      periodLabel: "FY27 Year-End",
      referenceNo: "LL-26YE-00002",
      revision: 3,
      revisionKind: "correction",
      revisionReason: "Fixed a typo",
      revisionActor: "Dana Reyes",
      submittedAt: "2026-10-01T14:00:00Z",
      submittedByName: "Maria Santos",
      orgName: "Harbor Youth Alliance",
      ein: "12-3456789",
      awardAmount: 50000.5,
      definition,
      snapshot,
    });
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const text = await pdfText(bytes);
    for (const needle of [
      "Youth Services",
      "LL-26YE-00002",
      "Harbor Youth Alliance",
      "12-3456789",
      "Maria Santos",
      "Tutoring",
      "Program Coordinator, 0.6 FTE",
      "$40,000.00",
      "Personal services (PS) subtotal",
      "Other than personal services (OTPS) subtotal",
      "$50,000.50",
      "budget-remaining.xlsx",
      "Fixed a typo",
      "Revision 3",
    ]) {
      expect(text, needle).toContain(needle);
    }
  });

  it("names the file after the reference and revision", () => {
    expect(pdfFilename("LL-26YE-00002", 3)).toBe("LL-26YE-00002-revision-3.pdf");
  });

  it("paginates long answers without throwing on characters outside the font", async () => {
    const definition = buildDefinition("Youth Services", []);
    const snapshot = buildSnapshot({
      formVersionId: "fv",
      answers: { org_legal_name: "Café 中文 " + "word ".repeat(4000) },
      budget: [],
      attachments: [],
    });
    const bytes = await buildReportPdf({
      initiativeName: "Youth Services",
      periodLabel: "FY27 Year-End",
      referenceNo: "LL-26YE-00002",
      revision: 1,
      revisionKind: "submit",
      revisionReason: null,
      revisionActor: null,
      submittedAt: null,
      submittedByName: null,
      orgName: "Org",
      ein: "12-3456789",
      awardAmount: 1,
      definition,
      snapshot,
    });
    expect(bytes.length).toBeGreaterThan(1000);
  });

  const base = {
    initiativeName: "Youth Services",
    periodLabel: "FY27 Year-End",
    referenceNo: "LL-26YE-00002",
    revision: 2,
    revisionKind: "submit" as const,
    revisionReason: null,
    revisionActor: null,
    submittedAt: "2026-10-01T14:00:00Z",
    submittedByName: "Maria Santos",
    orgName: "Harbor Youth Alliance",
    ein: "12-3456789",
    awardAmount: 50000,
  };

  it("reads like an official record with the receipt code, and ends with the certification", async () => {
    const definition = buildDefinition("Youth Services", []);
    const snapshot = buildSnapshot({
      formVersionId: "fv",
      answers: {},
      budget: [],
      attachments: [{ path: "p/a.pdf", filename: "budget-remaining.xlsx", bytes: 2048, mime: "application/pdf" }],
      certification: {
        statement: "I certify that this report is accurate.",
        name: "Maria Santos",
        title: "Executive Director",
        certifiedAt: "2026-10-01T14:05:00Z",
      },
    });
    const text = await pdfText(await buildReportPdf({ ...base, receiptCode: "a1b2c3d4e5f6", definition, snapshot }));
    const lines = text.split("\n");
    expect(lines[0]).toBe("LedgerLine \u00b7 Submitted copy");
    expect(lines[1]).toBe("Reference LL-26YE-00002 \u00b7 Revision 2");
    expect(text).toContain("Receipt code");
    expect(text).toContain("a1b2c3d4e5f6");
    const heading = lines.indexOf("Certification");
    expect(heading).toBeGreaterThan(lines.indexOf("Attachments"));
    for (const needle of [
      "I certify that this report is accurate.",
      "Maria Santos",
      "Certified at submission by Maria Santos, Executive Director",
    ])
      expect(lines.slice(heading).join("\n")).toContain(needle);
  });

  it("drops characters the font cannot draw instead of printing question marks", async () => {
    const definition = buildDefinition("Youth Services", []);
    const snapshot = buildSnapshot({
      formVersionId: "fv",
      answers: { org_legal_name: "Caf\u00e9 \u4e2d\u6587 \ud83d\ude00 Alliance" },
      budget: [],
      attachments: [],
    });
    const text = await pdfText(
      await buildReportPdf({ ...base, orgName: "Caf\u00e9 \u4e2d\u6587 \ud83d\ude00 Alliance", definition, snapshot }),
    );
    expect(text).toMatch(/Caf\u00e9 +Alliance/);
    expect(text.split("\n").filter((line) => line.includes("Alliance") && line.includes("?"))).toEqual([]);
  });

  it("keeps a budget table header with its first row and never splits the Line heading", async () => {
    const definition = buildDefinition("Youth Services", []);
    const budget = Array.from({ length: 70 }, (_, index) => ({
      rowId: String(index + 1),
      position: index + 1,
      category: index % 2 ? ("PS" as const) : ("OTPS" as const),
      description: `Budget line number ${index + 1}`,
      amount: 100,
      actual: 90,
    }));
    const snapshot = buildSnapshot({ formVersionId: "fv", answers: {}, budget, attachments: [] });
    const pages = await pdfPages(await buildReportPdf({ ...base, awardAmount: 7000, definition, snapshot }));
    for (const lines of pages) {
      const at = lines.indexOf("Approved budget");
      if (at >= 0) expect(lines.slice(at + 1).some((line) => line.startsWith("Budget line number"))).toBe(true);
    }
    const all = pages.flat();
    expect(all).toContain("Line");
    expect(all.some((line) => line === "Lin" || line === "e")).toBe(false);
  });

  it("derives the certification from the submitter when the copy has no certification record", async () => {
    const definition = buildDefinition("Youth Services", []);
    const snapshot = buildSnapshot({ formVersionId: "fv", answers: {}, budget: [], attachments: [] });
    const text = await pdfText(
      await buildReportPdf({ ...base, submittedByTitle: "Program Director", definition, snapshot }),
    );
    expect(text).not.toContain("No certification was recorded");
    const lines = text.split("\n");
    const heading = lines.indexOf("Certification");
    expect(heading).toBeGreaterThan(lines.indexOf("Attachments"));
    expect(lines.slice(heading).join(" ")).toContain("Certified at submission by Maria Santos, Program Director");
  });

  it("leaves out the certification when nobody submitted the copy", async () => {
    const definition = buildDefinition("Youth Services", []);
    const snapshot = buildSnapshot({ formVersionId: "fv", answers: {}, budget: [], attachments: [] });
    const text = await pdfText(
      await buildReportPdf({ ...base, submittedAt: null, submittedByName: null, definition, snapshot }),
    );
    expect(text.split("\n")).not.toContain("Certification");
  });

  it("says when actual spending was not reported and drops the spending columns", async () => {
    const definition = buildDefinition("Youth Services", []);
    const budget = [{ rowId: "1", position: 1, category: "PS" as const, description: "Coordinator", amount: 50000 }];
    const snapshot = buildSnapshot({ formVersionId: "fv", answers: {}, budget, attachments: [] });
    const text = await pdfText(await buildReportPdf({ ...base, definition, snapshot }));
    expect(text).toContain("Actual spending was not reported with this revision.");
    expect(text).not.toContain("Actual spent");
  });

  it("never leaves a question label alone at the bottom of a page", async () => {
    const questions: Question[] = Array.from({ length: 160 }, (_, index) => ({
      key: `q${index}`,
      label: `Question label ${index}`,
      type: "textarea",
      required: false,
      scope: "initiative",
    }));
    const definition = buildDefinition("Youth Services", questions);
    const answers = Object.fromEntries(
      questions.map((q, index) => [q.key, "answer ".repeat(1 + ((index * 7) % 23) * 3)]),
    );
    const snapshot = buildSnapshot({ formVersionId: "fv", answers, budget: [], attachments: [] });
    const pages = await pdfPages(await buildReportPdf({ ...base, definition, snapshot }));
    expect(pages.length).toBeGreaterThan(1);
    for (const lines of pages) {
      const body = lines.filter((line) => !line.includes("Page "));
      expect(body[body.length - 1] ?? "").not.toMatch(/^Question label \d+$/);
    }
  });
});
