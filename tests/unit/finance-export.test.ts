import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildWorkbook, exportFilename, guardFormula, questionColumns, submissionsToCsv, workbookToBuffer, type ExportSubmission } from "@/lib/finance/review/export";

const sample = (over: Partial<ExportSubmission> = {}): ExportSubmission => ({
  referenceNo: "LL-26YE-00001",
  ein: "00-1040217",
  organization: "Mott Haven Youth Futures, Inc.",
  initiative: "After School Enrichment",
  category: "Youth Services",
  borough: "Bronx",
  period: "FY26-YE",
  fiscalYear: "FY26",
  status: "accepted",
  award: 62500,
  submittedAt: "2026-09-18T14:05:00Z",
  budgetTotal: 62500,
  fundingSource: "Citywide initiative",
  councilMembers: "Delia Cordero (District 8)",
  agency: "DYCD",
  contractStatus: "Registered",
  contractNumber: "DYCD-26-04218",
  contractRegisteredOn: "2025-10-14",
  answers: { participants_actual: "120", accomplishments: "=HYPERLINK(\"http://x\")", youth_breakdown: [{ age_group: "Under 10", count: 5 }] },
  budget: [{ position: 1, category: "PS", description: "Coordinator", amount: 40000 }],
  ...over,
});

const meta = { periodLabel: "FY26 Year-End", filters: ["borough = Bronx"], generatedAt: new Date("2026-10-14T12:00:00Z"), numericKeys: new Set(["participants_actual"]), rowCount: 1 };

describe("formula injection guard", () => {
  it("prefixes text that starts with a formula character", () => {
    expect(guardFormula("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(guardFormula("+1")).toBe("'+1");
    expect(guardFormula("-2")).toBe("'-2");
    expect(guardFormula("@cmd")).toBe("'@cmd");
  });

  it("leaves ordinary text alone", () => {
    expect(guardFormula("Youth Services")).toBe("Youth Services");
    expect(guardFormula("00-1040217")).toBe("00-1040217");
    expect(guardFormula("")).toBe("");
  });
});

describe("workbook", () => {
  const book = buildWorkbook([sample()], meta);

  it("has the three sheets in order", () => {
    expect(book.SheetNames).toEqual(["Submissions", "Budget lines", "README"]);
  });

  it("keeps EIN as text and amounts as numbers", () => {
    const sheet = book.Sheets["Submissions"];
    expect(sheet["B2"].t).toBe("s");
    expect(sheet["B2"].v).toBe("00-1040217");
    expect(sheet["J2"].t).toBe("n");
    expect(sheet["J2"].v).toBe(62500);
    expect(sheet["L2"].t).toBe("n");
  });

  it("[US-046] carries the award fields: funding source, Council Member, agency and contract", () => {
    const sheet = book.Sheets["Submissions"];
    expect([sheet["M1"].v, sheet["N1"].v, sheet["O1"].v, sheet["P1"].v, sheet["Q1"].v, sheet["R1"].v]).toEqual(["funding_source", "council_members", "agency", "contract_status", "contract_number", "contract_registered_on"]);
    expect(sheet["N2"].v).toBe("Delia Cordero (District 8)");
    expect(sheet["Q2"].v).toBe("DYCD-26-04218");
  });

  it("writes the submitted time as a date serial in New York time", () => {
    const cell = book.Sheets["Submissions"]["K2"];
    expect(cell.t).toBe("n");
    expect(cell.z).toBe("yyyy-mm-dd hh:mm");
    expect(cell.v).toBeCloseTo(46283.4201, 3);
  });

  it("adds one column per answered question and guards formulas", () => {
    const columns = questionColumns([sample()]);
    expect(columns).toEqual(["accomplishments", "participants_actual", "youth_breakdown"]);
    const sheet = book.Sheets["Submissions"];
    expect(sheet["S1"].v).toBe("accomplishments");
    expect(sheet["S2"].v.startsWith("'=")).toBe(true);
    expect(sheet["T2"].t).toBe("n");
    expect(sheet["T2"].v).toBe(120);
    expect(sheet["U2"].v).toBe("Under 10 5");
  });

  it("round trips through xlsx and carries the export note", () => {
    const parsed = XLSX.read(workbookToBuffer(book), { type: "buffer" });
    expect(parsed.SheetNames).toEqual(["Submissions", "Budget lines", "README"]);
    const readme = XLSX.utils.sheet_to_csv(parsed.Sheets["README"]);
    expect(readme).toContain("Exported from LedgerLine.");
    expect(readme).toContain("borough = Bronx");
    const budget = XLSX.utils.sheet_to_json<Record<string, unknown>>(parsed.Sheets["Budget lines"]);
    expect(budget).toEqual([{ reference_no: "LL-26YE-00001", position: 1, category: "PS", description: "Coordinator", amount: 40000 }]);
  });

  it("builds a CSV of the Submissions sheet only", () => {
    const csv = submissionsToCsv(book);
    const [header] = csv.split("\n");
    expect(header.startsWith("reference_no,ein,organization")).toBe(true);
    expect(csv).toContain("2026-09-18 10:05");
    expect(csv).not.toContain("README");
  });
});

describe("export filename", () => {
  it("includes the period and date", () => {
    expect(exportFilename("FY26-YE", "2026-10-14", "xlsx")).toBe("ledgerline-submissions-FY26-YE-2026-10-14.xlsx");
  });
});
