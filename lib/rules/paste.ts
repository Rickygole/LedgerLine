import { parseAmount } from "./money";

export type PastedRow = {
  category: "PS" | "OTPS";
  description: string;
  amount: number;
};

export type PasteResult = {
  rows: PastedRow[];
  skipped: { line: number; reason: string }[];
};

const HEADER_WORDS = ["category", "description", "amount", "line", "budget", "type"];

function normalizeCategory(raw: string): "PS" | "OTPS" | null {
  const value = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (["PS", "PERSONAL SERVICES", "PERSONNEL", "SALARY", "SALARIES"].includes(value)) return "PS";
  if (["OTPS", "OTHER THAN PERSONAL SERVICES", "NON-PERSONNEL", "OTHER"].includes(value)) return "OTPS";
  return null;
}

export function parseBudgetPaste(text: string): PasteResult {
  const rows: PastedRow[] = [];
  const skipped: { line: number; reason: string }[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === "") return;
    const cells = line.split("\t").map((cell) => cell.trim());
    const lower = cells.map((cell) => cell.toLowerCase());
    if (index === 0 && lower.some((cell) => HEADER_WORDS.includes(cell))) return;

    const nonEmpty = cells.filter((cell) => cell !== "");
    if (nonEmpty.length === 0) return;

    const amountIndex = [...cells.keys()].reverse().find((i) => parseAmount(cells[i]) !== null);
    if (amountIndex === undefined) {
      skipped.push({ line: lineNumber, reason: "No amount found" });
      return;
    }
    const amount = parseAmount(cells[amountIndex]) as number;

    let category: "PS" | "OTPS" | null = null;
    let categoryIndex = -1;
    cells.forEach((cell, i) => {
      if (category === null && i !== amountIndex) {
        const found = normalizeCategory(cell);
        if (found) {
          category = found;
          categoryIndex = i;
        }
      }
    });

    const description = cells
      .filter((cell, i) => i !== amountIndex && i !== categoryIndex && cell !== "" && !/^\d+$/.test(cell))
      .join(" ")
      .trim();

    if (/^(sub)?total\b/i.test(description)) return;

    rows.push({ category: category ?? "OTPS", description, amount });
  });

  return { rows, skipped };
}
