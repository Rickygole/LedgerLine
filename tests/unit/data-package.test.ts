import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildPackage, csvCell, tableCsv, undocumented, type CatalogColumn } from "@/lib/export/package";
import { buildZip, crc32 } from "@/lib/export/zip";

function readZip(buffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    expect(buffer.readUInt32LE(offset)).toBe(0x02014b50);
    const crc = buffer.readUInt32LE(offset + 16);
    const packed = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localName = buffer.readUInt16LE(local + 26);
    const localExtra = buffer.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    const data = inflateRawSync(buffer.subarray(start, start + packed));
    expect(data.length).toBe(size);
    expect(crc32(data)).toBe(crc);
    files.set(name, data.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

const column = (table_name: string, column_name: string, ordinal: number, data_type = "text"): CatalogColumn => ({ table_name, column_name, data_type, is_nullable: false, ordinal });

describe("[US-055][BR-020] the data package", () => {
  it("writes a zip whose files read back exactly, with valid checksums", () => {
    const zip = buildZip(
      [
        { name: "a.txt", data: "hello" },
        { name: "data/b.csv", data: "x,y\r\n1,2\r\n".repeat(500) },
        { name: "empty.txt", data: "" },
      ],
      new Date("2026-10-09T12:00:00Z")
    );
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["a.txt", "data/b.csv", "empty.txt"]);
    expect(files.get("a.txt")).toBe("hello");
    expect(files.get("data/b.csv")).toBe("x,y\r\n1,2\r\n".repeat(500));
    expect(files.get("empty.txt")).toBe("");
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("guards cells that start with a formula character and quotes commas, quotes and line breaks", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+1 212")).toBe("'+1 212");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(true)).toBe("true");
    expect(csvCell({ a: 1, b: [2] })).toBe('"{""a"":1,""b"":[2]}"');
  });

  it("writes a header row and one line per record, in catalog order", () => {
    expect(tableCsv(["id", "note"], [{ id: 1, note: "a" }, { id: 2, note: "=2+2" }])).toBe("﻿id,note\r\n1,a\r\n2,'=2+2\r\n");
  });

  it("builds a package with a README, a manifest and one file per table, with the row counts", () => {
    const catalog = [column("fiscal_year", "id", 1), column("fiscal_year", "starts_on", 2, "date"), column("council_member", "district", 1, "integer"), column("council_member", "full_name", 2)];
    const { files, manifest } = buildPackage({
      catalog,
      rows: { fiscal_year: [{ id: "FY27", starts_on: "2026-07-01" }], council_member: [{ district: 1, full_name: "A B" }, { district: 2, full_name: "C D" }] },
      generatedAt: new Date("2026-10-09T12:00:00Z"),
      generatedBy: "Priya Raman (priya.raman@finance.example.gov)",
    });
    expect(manifest).toEqual([
      { table: "council_member", file: "data/council_member.csv", rows: 2 },
      { table: "fiscal_year", file: "data/fiscal_year.csv", rows: 1 },
    ]);
    const names = files.map((f) => f.name);
    expect(names).toEqual(["README.txt", "manifest.csv", "data/council_member.csv", "data/fiscal_year.csv"]);
    const readme = String(files[0].data);
    expect(readme).toContain("belongs to the New York City Council");
    expect(readme).toContain("council_member (2 rows)");
    expect(readme).toContain("- district [integer]: Council district number.");
    expect(readme).toContain("- starts_on [date]: First day of the fiscal year.");
    expect(readme).toContain("password_hash");
  });

  it("reports any table or column that has no documentation", () => {
    expect(undocumented([column("fiscal_year", "id", 1), column("fiscal_year", "starts_on", 2)])).toEqual([]);
    expect(undocumented([column("brand_new_table", "id", 1), column("fiscal_year", "invented", 2)])).toEqual(["brand_new_table", "fiscal_year.invented"]);
  });
});
