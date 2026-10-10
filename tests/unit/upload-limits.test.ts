import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { contentLooksValid, mimeFor } from "@/lib/report/attachments";
import { MAX_UPLOAD_BYTES, clientCheckUpload, formatBytes, oversizeMessage } from "@/lib/report/upload-rules";
import { ALLOWED_TYPES, checkUpload, MAX_UPLOAD_BYTES as SERVER_MAX_UPLOAD_BYTES } from "@/lib/storage";

const MB = 1024 * 1024;

describe("[BR-012][US-024] upload size limit", () => {
  it("states the 25 MB cap the same way in the server and the browser", () => {
    expect(MAX_UPLOAD_BYTES).toBe(25 * MB);
    expect(SERVER_MAX_UPLOAD_BYTES).toBe(25 * MB);
  });

  it("accepts a file exactly at the cap and refuses one byte more", () => {
    expect(checkUpload("report.pdf", MAX_UPLOAD_BYTES)).toBeNull();
    expect(clientCheckUpload("report.pdf", MAX_UPLOAD_BYTES)).toBeNull();
    expect(checkUpload("budget.xlsx", 25 * MB + 1)).toContain("over the 25.0 MB limit for one file");
  });

  it("accepts files between 10 and 25 MB", () => {
    expect(checkUpload("big.pdf", 15 * MB)).toBeNull();
    expect(checkUpload("big.xlsx", 24 * MB)).toBeNull();
  });

  it("names the size of a file that is too large and never says it equals the limit", () => {
    expect(checkUpload("scan.pdf", 31 * MB)).toBe("This file is 31.0 MB, which is over the 25.0 MB limit for one file.");
    expect(checkUpload("big.pdf", MAX_UPLOAD_BYTES + 109)).toBe("This file is 25.1 MB, which is over the 25.0 MB limit for one file.");
    expect(oversizeMessage(MAX_UPLOAD_BYTES + 1)).not.toMatch(/\b25\.0 MB\./);
  });

  it("gives the browser the same answer as the server for every size", () => {
    for (const bytes of [1, 1024, 10 * MB, 25 * MB, 25 * MB + 1, 26 * MB, 100 * MB]) {
      expect(clientCheckUpload("report.pdf", bytes)).toBe(checkUpload("report.pdf", bytes));
    }
  });

  it("refuses an empty file", () => {
    expect(checkUpload("empty.csv", 0)).toBe("The file is empty.");
  });

  it("shows sizes with one decimal", () => {
    expect(formatBytes(15 * MB)).toBe("15.0 MB");
    expect(formatBytes(MAX_UPLOAD_BYTES)).toBe("25.0 MB");
  });
});

describe("[US-023] Excel, Word, CSV and PDF files are accepted", () => {
  it("accepts each of the four types in any letter case", () => {
    for (const name of ["roster.csv", "Budget.XLSX", "narrative.docx", "Invoice.PDF", "a.pdf", "a.docx", "a.xlsx", "a.csv"]) expect(checkUpload(name, 2048)).toBeNull();
  });

  it("refuses legacy Word and Excel files and other types in plain words", () => {
    for (const name of ["setup.exe", "photo.png", "notes.txt", "archive.zip", "macro.xlsm", "noextension", "minutes.doc", "ledger.xls"]) {
      expect(checkUpload(name, 2048)).toBe("Use PDF, Word (.docx), Excel (.xlsx) or CSV.");
    }
    expect(ALLOWED_TYPES.doc).toBeUndefined();
    expect(ALLOWED_TYPES.xls).toBeUndefined();
  });

  it("refuses a file whose content does not match its extension", () => {
    expect(contentLooksValid("fake.pdf", Buffer.from("MZ binary"))).toBe("This file does not look like a PDF.");
    expect(contentLooksValid("fake.docx", Buffer.from("%PDF-1.4"))).toBe("This file does not look like a Word file.");
    expect(contentLooksValid("fake.xlsx", Buffer.from("%PDF-1.4"))).toMatch(/^This file does not look like an? Excel file\.$/);
    expect(contentLooksValid("real.pdf", Buffer.from("%PDF-1.7\n"))).toBeNull();
    expect(contentLooksValid("real.xlsx", Buffer.from("PK\u0003\u0004"))).toBeNull();
  });

  it("maps each extension to its content type", () => {
    expect(mimeFor("roster.csv")).toBe("text/csv");
    expect(mimeFor("invoice.pdf")).toBe("application/pdf");
  });
});
