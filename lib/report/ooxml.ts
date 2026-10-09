import { inflateRawSync } from "node:zlib";

const MACRO_PARTS = /(^|\/)(vbaProject\.bin|vbaProjectSignature\.bin|vbaData\.xml)$|(^|\/)(macrosheets|dialogsheets)\//i;
const MAX_CONTENT_TYPES_BYTES = 1024 * 1024;
const MAX_ENTRIES = 20000;

type Entry = { name: string; method: number; compressedSize: number; localOffset: number };

function readEntries(buffer: Buffer): Entry[] | null {
  const floor = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= floor; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  const size = buffer.readUInt32LE(eocd + 12);
  const offset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff || count > MAX_ENTRIES || offset + size > buffer.length) return null;
  const entries: Entry[] = [];
  let at = offset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(at + 10);
    const compressedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const localOffset = buffer.readUInt32LE(at + 42);
    if (at + 46 + nameLength > buffer.length) return null;
    entries.push({ name: buffer.subarray(at + 46, at + 46 + nameLength).toString("utf8").replace(/\\/g, "/"), method, compressedSize, localOffset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Buffer, entry: Entry): Buffer | null {
  const at = entry.localOffset;
  if (at + 30 > buffer.length || buffer.readUInt32LE(at) !== 0x04034b50) return null;
  const start = at + 30 + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28);
  const raw = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method !== 8) return null;
  try {
    return inflateRawSync(raw, { maxOutputLength: MAX_CONTENT_TYPES_BYTES });
  } catch {
    return null;
  }
}

export function ooxmlProblem(extension: string, buffer: Buffer): string | null {
  const label = extension === "docx" ? "a Word" : "an Excel";
  const entries = readEntries(buffer);
  const contentTypes = entries?.find((entry) => entry.name === "[Content_Types].xml");
  if (!entries || !contentTypes) return `This file does not look like ${label} file.`;
  if (entries.some((entry) => MACRO_PARTS.test(entry.name))) return "Files that contain macros are not accepted. Save a copy without macros and upload that.";
  const types = readEntry(buffer, contentTypes);
  if (!types) return `This file does not look like ${label} file.`;
  if (/<Override\b[^>]*ContentType="[^"]*(macroEnabled|vbaProject)/i.test(types.toString("utf8"))) return "Files that contain macros are not accepted. Save a copy without macros and upload that.";
  return null;
}
