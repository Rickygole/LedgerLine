import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MAX_UPLOAD_BYTES, clientCheckUpload, formatBytes, oversizeMessage } from "@/lib/report/upload-rules";
import { ALLOWED_TYPES, checkUpload } from "@/lib/storage";

describe("[BR-012] upload size limit", () => {
  it("keeps the 25 MB cap and accepts a file exactly at it", () => {
    expect(MAX_UPLOAD_BYTES).toBe(26_214_400);
    expect(checkUpload("report.pdf", MAX_UPLOAD_BYTES)).toBeNull();
    expect(clientCheckUpload("report.pdf", MAX_UPLOAD_BYTES)).toBeNull();
  });

  it("accepts files between 10 and 25 MB", () => {
    expect(checkUpload("big.pdf", 15 * 1024 * 1024)).toBeNull();
    expect(checkUpload("big.xlsx", 24 * 1024 * 1024)).toBeNull();
  });

  it("never says a file over the limit equals the limit", () => {
    const message = checkUpload("big.pdf", MAX_UPLOAD_BYTES + 109);
    expect(message).toBe("This file is 25.1 MB, which is over the 25.0 MB limit for one file.");
    expect(oversizeMessage(MAX_UPLOAD_BYTES + 1)).not.toMatch(/\b25\.0 MB\./);
  });

  it("shows sizes with one decimal", () => {
    expect(formatBytes(15 * 1024 * 1024)).toBe("15.0 MB");
    expect(formatBytes(MAX_UPLOAD_BYTES)).toBe("25.0 MB");
  });
});

describe("[US-023] legacy Word and Excel files are no longer accepted", () => {
  it("rejects .doc and .xls by name", () => {
    expect(checkUpload("minutes.doc", 1000)).toBe("Use PDF, Word (.docx), Excel (.xlsx) or CSV.");
    expect(checkUpload("ledger.xls", 1000)).toBe("Use PDF, Word (.docx), Excel (.xlsx) or CSV.");
    expect(ALLOWED_TYPES.doc).toBeUndefined();
    expect(ALLOWED_TYPES.xls).toBeUndefined();
  });

  it("still rejects other types", () => {
    expect(checkUpload("setup.exe", 100)).toBe("Use PDF, Word (.docx), Excel (.xlsx) or CSV.");
  });

  it("still accepts the four supported types", () => {
    for (const name of ["a.pdf", "a.docx", "a.xlsx", "a.csv"]) expect(checkUpload(name, 1000)).toBeNull();
  });
});
