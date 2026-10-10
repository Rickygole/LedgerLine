import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildDefinition } from "@/lib/forms/standard";
import { buildReportPdf, pdfFilename } from "@/lib/report/pdf";
import { buildSnapshot } from "@/lib/snapshot";
import type { Question } from "@/lib/rules/types";

function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  const pattern = /(?<!end)stream\n([\s\S]*?)\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    let body: string;
    try {
      body = inflateSync(Buffer.from(match[1], "latin1")).toString("latin1");
    } catch {
      continue;
    }
    for (const hex of body.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      out.push(Buffer.from(hex[1], "hex").toString("latin1"));
    }
  }
  return out.join("\n");
}

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
    const text = pdfText(bytes);
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
});
