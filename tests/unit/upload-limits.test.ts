import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MAX_UPLOAD_BYTES, clientCheckUpload, formatBytes, oversizeMessage } from "@/lib/report/upload-rules";
import { ALLOWED_TYPES, checkUpload } from "@/lib/storage";

describe("[BR-012][US-024] upload size limit", () => {
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

describe("[US-023] legacy Word and Excel files", () => {
  it("accepts .doc and .xls by name", () => {
    expect(checkUpload("minutes.doc", 1000)).toBeNull();
    expect(checkUpload("ledger.xls", 1000)).toBeNull();
    expect(ALLOWED_TYPES.doc).toBe("application/msword");
    expect(ALLOWED_TYPES.xls).toBe("application/vnd.ms-excel");
  });

  it("still rejects other types", () => {
    expect(checkUpload("setup.exe", 100)).toBe("Use PDF, Word, Excel or CSV.");
  });
});

describe("[US-023] legacy file content checks", () => {
  it("is applied by contentLooksValid", async () => {
    const { contentLooksValid } = await import("@/lib/report/attachments");
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(contentLooksValid("minutes.doc", ole)).toBeNull();
    expect(contentLooksValid("fake.xls", Buffer.from("MZ executable"))).toBe("This file does not look like an Excel file.");
    expect(contentLooksValid("fake.doc", Buffer.from("%PDF-1.4"))).toBe("This file does not look like a Word file.");
  });
});
