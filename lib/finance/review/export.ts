import * as XLSX from "xlsx";

export const FIXED_COLUMNS = [
  "reference_no",
  "ein",
  "organization",
  "initiative",
  "category",
  "borough",
  "period",
  "fiscal_year",
  "status",
  "award",
  "submitted_at",
  "budget_total",
] as const;

export const BUDGET_COLUMNS = ["reference_no", "position", "category", "description", "amount"] as const;

export const DISCLAIMER = "SYNTHETIC DEMO DATA. Not NYC Council records.";

export type ExportBudgetLine = { position: number; category: string; description: string; amount: number };

export type ExportSubmission = {
  referenceNo: string;
  ein: string;
  organization: string;
  initiative: string;
  category: string;
  borough: string;
  period: string;
  fiscalYear: string;
  status: string;
  award: number;
  submittedAt: string | null;
  budgetTotal: number;
  answers: Record<string, unknown>;
  budget: ExportBudgetLine[];
};

export type ExportMeta = {
  periodLabel: string;
  filters: string[];
  generatedAt: Date;
  numericKeys: Set<string>;
  rowCount: number;
};

const FORMULA_START = /^[=+\-@\t\r]/;

export function guardFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

function textCell(value: string): XLSX.CellObject {
  return { t: "s", v: guardFormula(value) };
}

function numberCell(value: number, format?: string): XLSX.CellObject {
  return { t: "n", v: value, ...(format ? { z: format } : {}) };
}

export function excelSerialInNewYork(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall / 86_400_000 + 25569;
}

export function describeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value
      .map((row) =>
        Object.values(row as Record<string, unknown>)
          .map((v) => String(v ?? ""))
          .join(" ")
      )
      .join("; ");
  }
  return String(value);
}

function answerCell(value: unknown, numeric: boolean): XLSX.CellObject | null {
  if (value === null || value === undefined || value === "") return null;
  if (numeric) {
    const n = Number(String(value).replace(/[$,%\s,]/g, ""));
    if (Number.isFinite(n)) return numberCell(n);
  }
  return textCell(describeValue(value));
}

export function questionColumns(submissions: ExportSubmission[]): string[] {
  const keys = new Set<string>();
  for (const submission of submissions) for (const key of Object.keys(submission.answers)) keys.add(key);
  return [...keys].sort().map((key) => ((FIXED_COLUMNS as readonly string[]).includes(key) ? `${key}_answer` : key));
}

function setRange(sheet: XLSX.WorkSheet, rows: number, cols: number) {
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows - 1, 0), c: Math.max(cols - 1, 0) } });
}

export function submissionsSheet(submissions: ExportSubmission[], numericKeys: Set<string>): XLSX.WorkSheet {
  const extra = questionColumns(submissions);
  const header = [...FIXED_COLUMNS, ...extra];
  const sheet: XLSX.WorkSheet = {};
  header.forEach((name, c) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c })] = { t: "s", v: name };
  });
  submissions.forEach((s, index) => {
    const r = index + 1;
    const cells: (XLSX.CellObject | null)[] = [
      textCell(s.referenceNo),
      textCell(s.ein),
      textCell(s.organization),
      textCell(s.initiative),
      textCell(s.category),
      textCell(s.borough),
      textCell(s.period),
      textCell(s.fiscalYear),
      textCell(s.status),
      numberCell(s.award, "#,##0.00"),
      s.submittedAt ? numberCell(excelSerialInNewYork(s.submittedAt), "yyyy-mm-dd hh:mm") : null,
      numberCell(s.budgetTotal, "#,##0.00"),
    ];
    for (const column of extra) {
      const key = column.endsWith("_answer") && (FIXED_COLUMNS as readonly string[]).includes(column.slice(0, -7)) ? column.slice(0, -7) : column;
      cells.push(answerCell(s.answers[key], numericKeys.has(key)));
    }
    cells.forEach((cell, c) => {
      if (cell) sheet[XLSX.utils.encode_cell({ r, c })] = cell;
    });
  });
  const widths = header.map((name, c) => ({ wch: Math.min(48, Math.max(name.length + 2, c === 2 || c === 3 ? 32 : 14)) }));
  sheet["!cols"] = widths;
  setRange(sheet, submissions.length + 1, header.length);
  return sheet;
}

export function budgetSheet(submissions: ExportSubmission[]): XLSX.WorkSheet {
  const sheet: XLSX.WorkSheet = {};
  BUDGET_COLUMNS.forEach((name, c) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c })] = { t: "s", v: name };
  });
  let r = 1;
  for (const s of submissions) {
    for (const line of s.budget) {
      sheet[XLSX.utils.encode_cell({ r, c: 0 })] = textCell(s.referenceNo);
      sheet[XLSX.utils.encode_cell({ r, c: 1 })] = numberCell(line.position);
      sheet[XLSX.utils.encode_cell({ r, c: 2 })] = textCell(line.category);
      sheet[XLSX.utils.encode_cell({ r, c: 3 })] = textCell(line.description);
      sheet[XLSX.utils.encode_cell({ r, c: 4 })] = numberCell(line.amount, "#,##0.00");
      r += 1;
    }
  }
  sheet["!cols"] = [{ wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 44 }, { wch: 14 }];
  setRange(sheet, r, BUDGET_COLUMNS.length);
  return sheet;
}

export function readmeSheet(meta: ExportMeta): XLSX.WorkSheet {
  const lines: string[][] = [
    ["LedgerLine export"],
    [DISCLAIMER],
    [],
    ["Sheet", "What it contains"],
    ["Submissions", "One row per submitted or drafted report. Fixed columns first, then one column per question key found in the answers."],
    ["Budget lines", "One row per budget line, linked to Submissions by reference_no. Amounts are numbers in US dollars."],
    ["README", "This sheet."],
    [],
    ["Reporting period", meta.periodLabel],
    ["Filters applied", meta.filters.length > 0 ? meta.filters.join("; ") : "None"],
    ["Submission rows", String(meta.rowCount)],
    ["Generated at", meta.generatedAt.toISOString()],
    ["Notes", "EIN values are stored as text. Text that begins with = + - or @ has a leading apostrophe added so spreadsheets do not run it as a formula."],
  ];
  const sheet: XLSX.WorkSheet = {};
  lines.forEach((row, r) =>
    row.forEach((value, c) => {
      sheet[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: value };
    })
  );
  sheet["!cols"] = [{ wch: 20 }, { wch: 110 }];
  setRange(sheet, lines.length, 2);
  return sheet;
}

export function buildWorkbook(submissions: ExportSubmission[], meta: ExportMeta): XLSX.WorkBook {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, submissionsSheet(submissions, meta.numericKeys), "Submissions");
  XLSX.utils.book_append_sheet(book, budgetSheet(submissions), "Budget lines");
  XLSX.utils.book_append_sheet(book, readmeSheet({ ...meta, rowCount: submissions.length }), "README");
  return book;
}

export function workbookToBuffer(book: XLSX.WorkBook): Buffer {
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function submissionsToCsv(book: XLSX.WorkBook): string {
  return XLSX.utils.sheet_to_csv(book.Sheets["Submissions"], { forceQuotes: false });
}

export function exportFilename(period: string, date: string, ext: "xlsx" | "csv"): string {
  return `ledgerline-submissions-${period}-${date}.${ext}`;
}
