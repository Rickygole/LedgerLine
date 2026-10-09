import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Tx } from "@/lib/db";
import { ALLOWED_TYPES, extensionOf } from "@/lib/storage";
import type { AttachmentItem } from "./types";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

export function signPath(userId: string, submissionId: string, pathname: string): string {
  return createHmac("sha256", secret()).update(`${userId}|${submissionId}|${pathname}`).digest("hex");
}

export function pathSignatureValid(userId: string, submissionId: string, pathname: string, signature: string): boolean {
  const expected = Buffer.from(signPath(userId, submissionId, pathname), "hex");
  const given = Buffer.from(signature, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function cleanFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
  return cleaned.slice(-200) || "attachment";
}

export function contentLooksValid(filename: string, head: Buffer): string | null {
  const ext = extensionOf(filename);
  if (ext === "pdf" && head.subarray(0, 5).toString("latin1") !== "%PDF-") return "This file does not look like a PDF.";
  if ((ext === "docx" || ext === "xlsx") && head.subarray(0, 2).toString("latin1") !== "PK") return `This file does not look like a ${ext === "docx" ? "Word" : "Excel"} file.`;
  if (ext === "csv" && head.includes(0)) return "This file does not look like a CSV.";
  return null;
}

export function mimeFor(filename: string): string {
  return ALLOWED_TYPES[extensionOf(filename)] ?? "application/octet-stream";
}

export async function openSubmissionForUpload(tx: Tx, submissionId: string): Promise<{ ein: string } | null> {
  return tx.one<{ ein: string }>(
    `SELECT o.ein FROM submission s
     JOIN assignment a ON a.id = s.assignment_id
     JOIN organization o ON o.id = a.org_id
     WHERE s.id = $1 AND s.status IN ('draft', 'returned') AND a.org_id = app.org_id()`,
    [submissionId]
  );
}

export async function attachmentLimitProblem(tx: Tx, submissionId: string, bytes: number): Promise<string | null> {
  const row = await tx.one<{ files: number; total: string }>("SELECT count(*)::int AS files, coalesce(sum(bytes), 0)::text AS total FROM attachment WHERE submission_id = $1", [submissionId]);
  if ((row?.files ?? 0) >= 20) return "A report can have at most 20 files. Remove one to add another.";
  if (Number(row?.total ?? 0) + bytes > 200 * 1024 * 1024) return "A report can hold at most 200 MB of files. Remove a file to make room.";
  return null;
}

export async function insertAttachment(
  tx: Tx,
  input: { submissionId: string; pathname: string; filename: string; bytes: number; mime: string }
): Promise<AttachmentItem> {
  await tx.query("SELECT 1 FROM submission WHERE id = $1 FOR UPDATE", [input.submissionId]);
  const row = await tx.one<{ id: string; created_at: string; full_name: string | null }>(
    `WITH inserted AS (
       INSERT INTO attachment (submission_id, path, filename, bytes, mime, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, app.uid())
       RETURNING id, created_at, uploaded_by
     )
     SELECT i.id, i.created_at, u.full_name FROM inserted i LEFT JOIN app_user u ON u.id = i.uploaded_by`,
    [input.submissionId, input.pathname, input.filename, input.bytes, input.mime]
  );
  if (!row) throw new Error("attachment not saved");
  return { id: row.id, filename: input.filename, bytes: input.bytes, uploadedAt: new Date(row.created_at).toISOString(), uploadedByName: row.full_name };
}
