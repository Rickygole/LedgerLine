import { describe, expect, it } from "vitest";
import { parseBudgetPaste } from "@/lib/rules/paste";

describe("[US-025] budget paste from Excel", () => {
  it("skips a header row and maps category, description and amount", () => {
    const text =
      "Category\tDescription\tAmount\nPS\tProgram Director (0.5 FTE)\t$32,500.00\nOTPS\tCurriculum materials\t4,200";
    const { rows, skipped } = parseBudgetPaste(text);
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { category: "PS", description: "Program Director (0.5 FTE)", amount: 32500 },
      { category: "OTPS", description: "Curriculum materials", amount: 4200 },
    ]);
  });

  it("ignores blank lines and total rows", () => {
    const text = "PS\tCoordinator\t40000\n\n\tTotal\t40000\n";
    expect(parseBudgetPaste(text).rows).toHaveLength(1);
  });

  it("accepts long-form category names and a leading line number", () => {
    const { rows } = parseBudgetPaste("1\tPersonal Services\tCase manager\t(1,000)");
    expect(rows[0]).toEqual({ category: "PS", description: "Case manager", amount: -1000 });
  });

  it("reports lines with no amount instead of guessing", () => {
    const { rows, skipped } = parseBudgetPaste("PS\tCoordinator\tTBD");
    expect(rows).toHaveLength(0);
    expect(skipped).toEqual([{ line: 1, reason: "No amount found" }]);
  });

  it("[BR-008] handles a full 100-line paste", () => {
    const text = Array.from({ length: 100 }, (_, i) => `OTPS\tItem ${i + 1}\t$1,000.00`).join("\n");
    expect(parseBudgetPaste(text).rows).toHaveLength(100);
  });
});
