import { crc32, deflateRawSync } from "node:zlib";
import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { macroProblem } from "@/lib/report/attachments";
import { ooxmlProblem } from "@/lib/report/ooxml";

type Part = { name: string; data: string; deflate?: boolean };

function zip(parts: Part[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name);
    const raw = Buffer.from(part.data);
    const body = part.deflate ? deflateRawSync(raw) : raw;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(part.deflate ? 8 : 0, 8);
    header.writeUInt32LE(crc32(raw), 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(part.deflate ? 8 : 0, 10);
    entry.writeUInt32LE(crc32(raw), 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(header, name, body);
    central.push(entry, name);
    offset += header.length + name.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const PLAIN_TYPES = '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>';
const MACRO_TYPES = '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>';
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
    expect(ooxmlProblem("xlsx", zip([{ name: "[Content_Types].xml", data: PLAIN_TYPES }, { name: "xl/workbook.xml", data: "<workbook/>" }]))).toBeNull();
    expect(ooxmlProblem("xlsx", zip([{ name: "[Content_Types].xml", data: PLAIN_TYPES, deflate: true }, { name: "xl/workbook.xml", data: "<workbook/>", deflate: true }]))).toBeNull();
  });

  it("refuses a package that carries vbaProject.bin", () => {
    const file = zip([{ name: "[Content_Types].xml", data: PLAIN_TYPES }, { name: "xl/vbaProject.bin", data: "MACRO" }]);
    expect(ooxmlProblem("xlsx", file)).toBe(MESSAGE);
    expect(macroProblem("report.xlsx", file)).toBe(MESSAGE);
    expect(ooxmlProblem("docx", zip([{ name: "[Content_Types].xml", data: PLAIN_TYPES }, { name: "word/vbaProject.bin", data: "MACRO" }]))).toBe(MESSAGE);
  });

  it("refuses a macro-enabled content type even when renamed to .xlsx", () => {
    expect(ooxmlProblem("xlsx", zip([{ name: "[Content_Types].xml", data: MACRO_TYPES }, { name: "xl/workbook.xml", data: "<workbook/>" }]))).toBe(MESSAGE);
    expect(ooxmlProblem("xlsx", zip([{ name: "[Content_Types].xml", data: MACRO_TYPES, deflate: true }]))).toBe(MESSAGE);
  });

  it("refuses Excel 4 macro sheets", () => {
    expect(ooxmlProblem("xlsx", zip([{ name: "[Content_Types].xml", data: PLAIN_TYPES }, { name: "xl/macrosheets/sheet1.xml", data: "<x/>" }]))).toBe(MESSAGE);
  });

  it("refuses something that only starts with PK", () => {
    expect(ooxmlProblem("xlsx", Buffer.from("PK\u0003\u0004 not really a zip"))).toBe("This file does not look like an Excel file.");
    expect(ooxmlProblem("docx", Buffer.from("PK\u0003\u0004"))).toBe("This file does not look like a Word file.");
  });

  it("leaves PDF and CSV alone", () => {
    expect(macroProblem("a.pdf", Buffer.from("%PDF-1.4"))).toBeNull();
    expect(macroProblem("a.csv", Buffer.from("a,b\n1,2\n"))).toBeNull();
  });
});
