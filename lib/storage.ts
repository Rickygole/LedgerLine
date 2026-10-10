import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { FILE_TYPE_HELP, MAX_UPLOAD_BYTES, oversizeMessage } from "@/lib/report/upload-rules";

export { MAX_UPLOAD_BYTES };

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
  if (!ALLOWED_TYPES[ext]) return FILE_TYPE_HELP;
  if (bytes > MAX_UPLOAD_BYTES) return oversizeMessage(bytes);
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
    const response = await fetch(meta.downloadUrl ?? meta.url, {
      headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!response.ok) throw new Error("file not found");
    return Buffer.from(await response.arrayBuffer());
  }
  return readFile(path.join(localRoot(), pathname));
}

type StoredFile = { pathname: string; modifiedAt: Date; url?: string };

async function walk(root: string, dir: string, out: StoredFile[]): Promise<void> {
  let names: string[];
  try {
    names = await readdir(path.join(root, dir));
  } catch {
    return;
  }
  for (const name of names) {
    const relative = dir ? `${dir}/${name}` : name;
    const info = await stat(path.join(root, relative));
    if (info.isDirectory()) await walk(root, relative, out);
    else out.push({ pathname: relative, modifiedAt: info.mtime });
  }
}

export async function listStoredFiles(): Promise<StoredFile[]> {
  if (usingBlob()) {
    const { list } = await import("@vercel/blob");
    const files: StoredFile[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ cursor, limit: 1000 });
      for (const blob of page.blobs)
        files.push({ pathname: blob.pathname, modifiedAt: new Date(blob.uploadedAt), url: blob.url });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return files;
  }
  const files: StoredFile[] = [];
  await walk(localRoot(), "", files);
  return files;
}

export async function deleteStoredFile(file: StoredFile): Promise<void> {
  if (usingBlob()) {
    const { del } = await import("@vercel/blob");
    await del(file.url ?? file.pathname);
    return;
  }
  await rm(path.join(localRoot(), file.pathname), { force: true });
}
