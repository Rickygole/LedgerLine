import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ooxmlProblem } from "./ooxml";
import type { Tx } from "@/lib/db";
import { ALLOWED_TYPES, extensionOf } from "@/lib/storage";
import type { AttachmentItem } from "./types";

const PATH_KEY_LABEL = "ledgerline:attachment-path:v1";
export const UPLOAD_TICKET_SECONDS = 15 * 60;

function pathKey(): Buffer {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", value).update(PATH_KEY_LABEL).digest();
}

export function signPath(userId: string, submissionId: string, pathname: string, expiresAt: number = Math.floor(Date.now() / 1000) + UPLOAD_TICKET_SECONDS): string {
  const mac = createHmac("sha256", pathKey()).update(`${userId}|${submissionId}|${pathname}|${expiresAt}`).digest("hex");
  return `${expiresAt}.${mac}`;
}

function signatureExpiry(signature: string): number | null {
  const match = /^(\d{1,12})\.[0-9a-f]{64}$/.exec(signature);
  return match ? Number(match[1]) : null;
}

export function pathSignatureValid(userId: string, submissionId: string, pathname: string, signature: string): boolean {
  const expiresAt = signatureExpiry(signature);
  if (expiresAt === null || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signPath(userId, submissionId, pathname, expiresAt));
  const given = Buffer.from(signature);
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
  if ((ext === "docx" || ext === "xlsx") && head.subarray(0, 2).toString("latin1") !== "PK") return `This file does not look like ${ext === "docx" ? "a Word" : "an Excel"} file.`;
  if (ext === "csv" && head.includes(0)) return "This file does not look like a CSV.";
  return null;
}

export function macroProblem(filename: string, body: Buffer): string | null {
  const ext = extensionOf(filename);
  return ext === "docx" || ext === "xlsx" ? ooxmlProblem(ext, body) : null;
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
  const row = await tx.one<{ files: number; total: string }>("SELECT count(*)::int AS files, coalesce(sum(bytes), 0)::text AS total FROM attachment WHERE submission_id = $1 AND removed_at IS NULL", [submissionId]);
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

export async function removeAttachmentRow(tx: Tx, submissionId: string, attachmentId: string): Promise<number> {
  await tx.query("SELECT 1 FROM submission WHERE id = $1 FOR UPDATE", [submissionId]);
  const sent = await tx.one<{ id: string }>(
    `SELECT a.id FROM attachment a
     WHERE a.id = $1 AND a.submission_id = $2 AND a.removed_at IS NULL
       AND EXISTS (
         SELECT 1 FROM submission_revision r
         WHERE r.submission_id = a.submission_id AND r.snapshot -> 'attachments' @> jsonb_build_array(jsonb_build_object('path', a.path))
       )`,
    [attachmentId, submissionId]
  );
  const rows = sent
    ? await tx.query<{ filename: string }>("UPDATE attachment SET removed_at = now(), removed_by = app.uid() WHERE id = $1 AND submission_id = $2 AND removed_at IS NULL RETURNING filename", [attachmentId, submissionId])
    : await tx.query<{ filename: string }>("DELETE FROM attachment WHERE id = $1 AND submission_id = $2 AND removed_at IS NULL RETURNING filename", [attachmentId, submissionId]);
  if (rows[0]) {
    await tx.query("SELECT app.write_audit('submission', $1, 'attachment_removed', $2, NULL, NULL, NULL)", [submissionId, rows[0].filename]);
  }
  return rows.length;
}
