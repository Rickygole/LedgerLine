import { describe, expect, it } from "vitest";
import { amountIssues, linesFromRows, rowsFromLines } from "@/lib/report/budget-rows";
import { clientCheckUpload } from "@/lib/report/upload-rules";

describe("budget rows", () => {
  it("round trips lines through editable rows", () => {
    const lines = [
      { rowId: "a", position: 1, category: "OTPS" as const, description: "Supplies", amount: 1234.5, actual: null },
    ];
    const rows = rowsFromLines(lines);
    expect(rows[0].amountText).toBe("1,234.50");
    expect(linesFromRows(rows)).toEqual(lines);
  });

  it("reports an amount that is not a number", () => {
    const issues = amountIssues([
      { rowId: "a", category: "PS", description: "x", amountText: "twelve", actualText: "" },
    ]);
    expect(issues[0].message).toBe(
      "Line 1: enter the amount as a number with at most 2 decimal places, like 1,250.00.",
    );
  });
});

describe("client upload checks", () => {
  it("rejects other file types and oversize files in words", () => {
    expect(clientCheckUpload("setup.exe", 100)).toBe("Use PDF, Word (.docx), Excel (.xlsx) or CSV.");
    expect(clientCheckUpload("big.pdf", 31 * 1024 * 1024)).toBe(
      "This file is 31.0 MB, which is over the 25.0 MB limit for one file.",
    );
    expect(clientCheckUpload("ok.pdf", 100)).toBeNull();
  });
});

describe("[US-029] actual spent text", () => {
  it("keeps a blank actual as null and a typed one as a number", () => {
    const rows = [
      { rowId: "a", category: "PS" as const, description: "Staff", amountText: "1,000.00", actualText: "" },
      { rowId: "b", category: "PS" as const, description: "Rent", amountText: "500.00", actualText: "450" },
    ];
    expect(linesFromRows(rows).map((l) => l.actual)).toEqual([null, 450]);
  });

  it("flags a third decimal place on either amount", () => {
    const issues = amountIssues([
      { rowId: "a", category: "PS", description: "x", amountText: "10.001", actualText: "5.555" },
    ]);
    expect(issues).toHaveLength(2);
  });

  it("caps an absurd amount so the save still goes through and submit blocks it", () => {
    const lines = linesFromRows([
      { rowId: "a", category: "PS", description: "x", amountText: "99999999999999999999999", actualText: "" },
    ]);
    expect(lines[0].amount).toBe(99_999_999_999.99);
  });
});
