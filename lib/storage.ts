import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};

export function extensionOf(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

export function checkUpload(filename: string, bytes: number): string | null {
  const ext = extensionOf(filename);
  if (!ALLOWED_TYPES[ext]) return "Use PDF, Word, Excel or CSV.";
  if (bytes > MAX_UPLOAD_BYTES) return `${(bytes / 1024 / 1024).toFixed(0)} MB. The limit is 25 MB.`;
  if (bytes <= 0) return "The file is empty.";
  return null;
}

export function buildPath(ein: string, submissionId: string, filename: string): string {
  return `${ein}/${submissionId}/${randomUUID()}.${extensionOf(filename)}`;
}

function localRoot() {
  return path.join(process.env.LOCAL_STORAGE_DIR ?? path.join(process.cwd(), ".storage"));
}

export function usingBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function putFile(pathname: string, body: Buffer, contentType: string): Promise<void> {
  if (usingBlob()) {
    const { put } = await import("@vercel/blob");
    await put(pathname, body, { access: "private" as "public", contentType, addRandomSuffix: false });
    return;
  }
  const target = path.join(localRoot(), pathname);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

export async function getFile(pathname: string): Promise<Buffer> {
  if (usingBlob()) {
    const blob = await import("@vercel/blob");
    const meta = await blob.head(pathname);
    const response = await fetch(meta.downloadUrl ?? meta.url, { headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } });
    if (!response.ok) throw new Error("file not found");
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(path.join(localRoot(), pathname));
}
