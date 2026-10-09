import { describe, expect, it } from "vitest";
import { amountIssues, linesFromRows, rowsFromLines } from "@/lib/report/budget-rows";
import { clientCheckUpload } from "@/lib/report/upload-rules";

describe("budget rows", () => {
  it("round trips lines through editable rows", () => {
    const lines = [{ rowId: "a", position: 1, category: "OTPS" as const, description: "Supplies", amount: 1234.5 }];
    const rows = rowsFromLines(lines);
    expect(rows[0].amountText).toBe("1,234.50");
    expect(linesFromRows(rows)).toEqual(lines);
  });

  it("reports an amount that is not a number", () => {
    const issues = amountIssues([{ rowId: "a", category: "PS", description: "x", amountText: "twelve" }]);
    expect(issues[0].message).toBe("Line 1: enter the amount as a number, like 1,250.00.");
  });
});

describe("client upload checks", () => {
  it("rejects other file types and oversize files in words", () => {
    expect(clientCheckUpload("setup.exe", 100)).toBe("Use PDF, Word, Excel or CSV.");
    expect(clientCheckUpload("big.pdf", 31 * 1024 * 1024)).toBe("31 MB. The limit is 25 MB.");
    expect(clientCheckUpload("ok.pdf", 100)).toBeNull();
  });
});
