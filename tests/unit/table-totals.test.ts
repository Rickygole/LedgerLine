import { describe, expect, it } from "vitest";
import { buildDefinition } from "@/lib/forms/standard";
import { columnTotals, totalsAnnouncement, totalsRow } from "@/lib/report/table-totals";
import { plainTextReport } from "@/lib/report/format";
import { buildReportPdf } from "@/lib/report/pdf";
import { buildSnapshot } from "@/lib/snapshot";
import type { Question } from "@/lib/rules/types";
import { pdfText } from "./pdf-text";

const grants: Question = {
  key: "grants",
  label: "Sites and funding",
  type: "table",
  required: false,
  scope: "initiative",
  columns: [
    { key: "site", label: "Site", type: "text" },
    { key: "visits", label: "Visits", type: "integer" },
    { key: "hours", label: "Hours", type: "number" },
    { key: "cost", label: "Cost", type: "currency" },
    { key: "share", label: "Share", type: "percent" },
  ],
  sumRule: { column: "share", target: 100 },
};

const rows = [
  { site: "Bronx", visits: "1200", hours: "10.5", cost: "1500.25", share: "60" },
  { site: "Queens", visits: "300", hours: "4.25", cost: "$2,000", share: "35" },
  { site: "", visits: "", hours: "", cost: "", share: "" },
];

describe("[US-026] table totals calculate automatically", () => {
  it("totals every numeric column and formats each like the column", () => {
    const totals = columnTotals(grants, rows);
    expect(totals.map((t) => [t.key, t.text])).toEqual([
      ["visits", "1,500"],
      ["hours", "14.75"],
      ["cost", "$3,500.25"],
      ["share", "95%"],
    ]);
  });

  it("adds decimals without floating point drift", () => {
    const question: Question = { ...grants, sumRule: undefined };
    const value = [{ cost: "0.1" }, { cost: "0.2" }, { cost: "0.3" }];
    expect(columnTotals(question, value).find((t) => t.key === "cost")?.text).toBe("$0.60");
  });

  it("shows the sum rule target next to the percent total and says whether it is met", () => {
    const short = columnTotals(grants, rows).find((t) => t.key === "share")!;
    expect(short.goal).toBe("100%");
    expect(short.met).toBe(false);
    const met = columnTotals(grants, [{ share: "60" }, { share: "40" }]).find((t) => t.key === "share")!;
    expect(met.met).toBe(true);
    expect(totalsAnnouncement([short])).toBe("Totals: Share 95% of 100%.");
  });

  it("resolves an award target from the award amount", () => {
    const question: Question = { ...grants, sumRule: { column: "cost", target: "award" } };
    const withAward = columnTotals(question, [{ cost: "400" }, { cost: "600" }], 1000).find((t) => t.key === "cost")!;
    expect(withAward).toMatchObject({ goal: "$1,000", met: true });
    const without = columnTotals(question, [{ cost: "400" }]).find((t) => t.key === "cost")!;
    expect(without).toMatchObject({ goal: "the award", met: null });
  });

  it("leaves a column with no entries out of the printed total row and skips tables with no numbers", () => {
    expect(totalsRow(grants, [{ site: "Bronx", visits: "5" }])).toEqual(["Total", "5", "", "", ""]);
    expect(totalsRow(grants, [{ site: "Bronx" }])).toBeNull();
    expect(totalsRow(grants, [])).toBeNull();
    const text: Question = { ...grants, columns: [{ key: "site", label: "Site", type: "text" }], sumRule: undefined };
    expect(columnTotals(text, [{ site: "Bronx" }])).toEqual([]);
  });

  it("labels the total in the first numeric column when the table has no text column", () => {
    const question: Question = {
      ...grants,
      columns: [
        { key: "a", label: "A", type: "integer" },
        { key: "b", label: "B", type: "currency" },
      ],
      sumRule: undefined,
    };
    expect(
      totalsRow(question, [
        { a: "2", b: "10" },
        { a: "3", b: "5" },
      ]),
    ).toEqual(["Total: 5", "$15"]);
  });

  it("carries the totals into the email copy text", () => {
    const definition = buildDefinition("t", [grants]);
    const body = plainTextReport({
      title: "Youth Services",
      referenceNo: "LL-26YE-12345",
      periodLabel: "FY26 Year-End",
      orgName: "Harbor Youth Alliance",
      ein: "12-3456789",
      awardAmount: 1000,
      definition,
      answers: { grants: rows },
      budget: [{ position: 1, category: "PS", description: "Director", amount: 1000 }],
      attachments: [],
    });
    expect(body).toContain("  Total: Visits: 1,500; Hours: 14.75; Cost: $3,500.25; Share: 95% of 100%");
  });

  it("carries the totals into the PDF", async () => {
    const definition = buildDefinition("Youth Services", [grants]);
    const snapshot = buildSnapshot({
      formVersionId: "fv",
      answers: { grants: rows, org_legal_name: "Harbor Youth Alliance" },
      budget: [{ rowId: "1", position: 1, category: "PS", description: "Director", amount: 1000 }],
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
      submittedAt: "2026-10-01T14:00:00Z",
      submittedByName: "Maria Santos",
      orgName: "Harbor Youth Alliance",
      ein: "12-3456789",
      awardAmount: 1000,
      definition,
      snapshot,
    });
    const text = await pdfText(bytes);
    expect(text).toContain("$3,500.25");
    expect(text).toContain("95% of 100%");
    expect(text).toContain("14.75");
  });
});
