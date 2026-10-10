import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { macroProblem } from "@/lib/report/attachments";
import { ooxmlProblem } from "@/lib/report/ooxml";
import { zip } from "./zip-fixture";

const PLAIN_TYPES =
  '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>';
const MACRO_TYPES =
  '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>';
const MESSAGE = "Files that contain macros are not accepted. Save a copy without macros and upload that.";

describe("[US-023] attachments with macros are refused", () => {
  it("accepts a real workbook written by the xlsx library", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["a", 1]]), "Sheet1");
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(ooxmlProblem("xlsx", buffer)).toBeNull();
    expect(macroProblem("budget.xlsx", buffer)).toBeNull();
  });

  it("accepts a plain package with stored and deflated parts", () => {
    expect(
      ooxmlProblem(
        "xlsx",
        zip([
          { name: "[Content_Types].xml", data: PLAIN_TYPES },
          { name: "xl/workbook.xml", data: "<workbook/>" },
        ]),
      ),
    ).toBeNull();
    expect(
      ooxmlProblem(
        "xlsx",
        zip([
          { name: "[Content_Types].xml", data: PLAIN_TYPES, deflate: true },
          { name: "xl/workbook.xml", data: "<workbook/>", deflate: true },
        ]),
      ),
    ).toBeNull();
  });

  it("refuses a package that carries vbaProject.bin", () => {
    const file = zip([
      { name: "[Content_Types].xml", data: PLAIN_TYPES },
      { name: "xl/vbaProject.bin", data: "MACRO" },
    ]);
    expect(ooxmlProblem("xlsx", file)).toBe(MESSAGE);
    expect(macroProblem("report.xlsx", file)).toBe(MESSAGE);
    expect(
      ooxmlProblem(
        "docx",
        zip([
          { name: "[Content_Types].xml", data: PLAIN_TYPES },
          { name: "word/vbaProject.bin", data: "MACRO" },
        ]),
      ),
    ).toBe(MESSAGE);
  });

  it("refuses a macro-enabled content type even when renamed to .xlsx", () => {
    expect(
      ooxmlProblem(
        "xlsx",
        zip([
          { name: "[Content_Types].xml", data: MACRO_TYPES },
          { name: "xl/workbook.xml", data: "<workbook/>" },
        ]),
      ),
    ).toBe(MESSAGE);
    expect(ooxmlProblem("xlsx", zip([{ name: "[Content_Types].xml", data: MACRO_TYPES, deflate: true }]))).toBe(
      MESSAGE,
    );
  });

  it("refuses Excel 4 macro sheets", () => {
    expect(
      ooxmlProblem(
        "xlsx",
        zip([
          { name: "[Content_Types].xml", data: PLAIN_TYPES },
          { name: "xl/macrosheets/sheet1.xml", data: "<x/>" },
        ]),
      ),
    ).toBe(MESSAGE);
  });

  it("refuses something that only starts with PK", () => {
    expect(ooxmlProblem("xlsx", Buffer.from("PK\u0003\u0004 not really a zip"))).toBe(
      "This file does not look like an Excel file.",
    );
    expect(ooxmlProblem("docx", Buffer.from("PK\u0003\u0004"))).toBe("This file does not look like a Word file.");
  });

  it("leaves PDF and CSV alone", () => {
    expect(macroProblem("a.pdf", Buffer.from("%PDF-1.4"))).toBeNull();
    expect(macroProblem("a.csv", Buffer.from("a,b\n1,2\n"))).toBeNull();
  });
});
