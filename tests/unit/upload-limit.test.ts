import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const MB = 1024 * 1024;

describe("[BR-012][US-024] uploads are limited to 25 MB per file", () => {
  it("states the limit as 25 megabytes in both the server and the browser", async () => {
    const server = await import("@/lib/storage");
    const browser = await import("@/lib/report/upload-rules");
    expect(server.MAX_UPLOAD_BYTES).toBe(25 * MB);
    expect(browser.MAX_UPLOAD_BYTES).toBe(25 * MB);
  });

  it("accepts a file of exactly 25 MB and refuses one byte more", async () => {
    const { checkUpload } = await import("@/lib/storage");
    expect(checkUpload("budget.xlsx", 25 * MB)).toBeNull();
    expect(checkUpload("budget.xlsx", 25 * MB + 1)).toContain("over the 25.0 MB limit for one file");
  });

  it("refuses a 31 MB file on the server and names its size", async () => {
    const { checkUpload } = await import("@/lib/storage");
    expect(checkUpload("scan.pdf", 31 * MB)).toBe("This file is 31.0 MB, which is over the 25.0 MB limit for one file.");
  });

  it("gives the browser the same answer as the server for every size", async () => {
    const { checkUpload } = await import("@/lib/storage");
    const { clientCheckUpload } = await import("@/lib/report/upload-rules");
    for (const bytes of [1, 1024, 10 * MB, 25 * MB, 25 * MB + 1, 26 * MB, 100 * MB]) {
      expect(clientCheckUpload("report.pdf", bytes)).toBe(checkUpload("report.pdf", bytes));
    }
  });

  it("refuses an empty file", async () => {
    const { checkUpload } = await import("@/lib/storage");
    expect(checkUpload("empty.csv", 0)).toBe("The file is empty.");
  });
});

describe("[US-023] Excel, Word, CSV and PDF files are accepted", () => {
  it("accepts each of the four types in any letter case", async () => {
    const { checkUpload } = await import("@/lib/storage");
    for (const name of ["roster.csv", "Budget.XLSX", "narrative.docx", "Invoice.PDF"]) expect(checkUpload(name, 2048)).toBeNull();
  });

  it("refuses other types in plain words", async () => {
    const { checkUpload } = await import("@/lib/storage");
    for (const name of ["setup.exe", "photo.png", "notes.txt", "archive.zip", "macro.xlsm", "noextension"]) {
      expect(checkUpload(name, 2048)).toBe("Use PDF, Word, Excel or CSV.");
    }
  });

  it("refuses a file whose content does not match its extension", async () => {
    const { contentLooksValid } = await import("@/lib/report/attachments");
    expect(contentLooksValid("fake.pdf", Buffer.from("MZ binary"))).toBe("This file does not look like a PDF.");
    expect(contentLooksValid("fake.docx", Buffer.from("%PDF-1.4"))).toBe("This file does not look like a Word file.");
    expect(contentLooksValid("fake.xlsx", Buffer.from("%PDF-1.4"))).toMatch(/^This file does not look like an? Excel file\.$/);
    expect(contentLooksValid("real.pdf", Buffer.from("%PDF-1.7\n"))).toBeNull();
    expect(contentLooksValid("real.xlsx", Buffer.from("PK\u0003\u0004"))).toBeNull();
  });

  it("maps each extension to its content type", async () => {
    const { mimeFor } = await import("@/lib/report/attachments");
    expect(mimeFor("roster.csv")).toBe("text/csv");
    expect(mimeFor("invoice.pdf")).toBe("application/pdf");
  });
});
