"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { pgCode, withClaims } from "@/lib/db";
import { loadReport } from "@/lib/report/data";
import { writeDraft } from "@/lib/report/write";
import { cleanFilename, contentLooksValid, insertAttachment, mimeFor, openSubmissionForUpload, pathSignatureValid, signPath } from "@/lib/report/attachments";
import type { PrepareUploadResult, SaveResult, UploadActionResult } from "@/lib/report/types";
import { buildPath, checkUpload, putFile } from "@/lib/storage";

const cell = z.union([z.string().max(2000), z.number(), z.null()]);

const answerValue = z.union([z.string().max(30000), z.number(), z.boolean(), z.null(), z.array(z.record(z.string(), cell)).max(200)]);

const saveSchema = z.object({
  submissionId: z.uuid(),
  expectedLock: z.number().int().min(0),
  answers: z.record(z.string(), answerValue),
  budget: z
    .array(
      z.object({
        rowId: z.uuid(),
        position: z.number().int().min(1).max(10000),
        category: z.enum(["PS", "OTPS"]),
        description: z.string().max(500),
        amount: z.number().min(-1e11).max(1e11),
      })
    )
    .max(100),
});

export async function saveDraft(raw: unknown): Promise<SaveResult> {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Some entries could not be saved. Check for very long text." };
  const input = parsed.data;

  const user = await getCurrentUser().catch(() => null);
  if (!user) return { status: "signed_out" };

  try {
    return await withClaims(user.id, async (tx): Promise<SaveResult> => {
      const touched = await tx.one<{ lock_version: number; updated_at: string }>(
        `UPDATE submission SET lock_version = lock_version + 1, updated_at = now(), updated_by = app.uid()
         WHERE id = $1 AND lock_version = $2 AND status IN ('draft', 'returned')
         RETURNING lock_version, updated_at`,
        [input.submissionId, input.expectedLock]
      );
      if (!touched) {
        const current = await tx.one<{ status: string; updated_at: string; full_name: string | null }>(
          `SELECT s.status, s.updated_at, u.full_name FROM submission s LEFT JOIN app_user u ON u.id = s.updated_by WHERE s.id = $1`,
          [input.submissionId]
        );
        if (!current) return { status: "error", message: "This report could not be found." };
        if (current.status !== "draft" && current.status !== "returned") {
          return { status: "locked", message: "This report was already submitted and can no longer be edited." };
        }
        return { status: "stale", by: current.full_name, at: new Date(current.updated_at).toISOString() };
      }
      const report = await loadReport(tx, input.submissionId);
      if (!report) return { status: "error", message: "This report could not be found." };
      const allowedKeys = new Set(report.definition.sections.flatMap((section) => section.questions.map((q) => q.key)));
      const maxLines = report.definition.budget.maxLines;
      await writeDraft(tx, { submissionId: input.submissionId, answers: input.answers, budget: input.budget.slice(0, maxLines), allowedKeys });
      return { status: "saved", lockVersion: touched.lock_version, savedAt: new Date(touched.updated_at).toISOString() };
    });
  } catch (error) {
    const code = pgCode(error);
    if (code === "42501") return { status: "locked", message: "You do not have permission to change this report." };
    if (code === "40001") return { status: "stale", by: null, at: new Date().toISOString() };
    return { status: "error", message: "Couldn't save. Keep this tab open." };
  }
}

const uploadTarget = z.object({ submissionId: z.uuid(), filename: z.string().min(1).max(400), bytes: z.number().int().min(0) });

export async function prepareUpload(raw: unknown): Promise<PrepareUploadResult> {
  const parsed = uploadTarget.safeParse(raw);
  if (!parsed.success) return { status: "rejected", message: "That file could not be read." };
  const { submissionId, bytes } = parsed.data;
  const filename = cleanFilename(parsed.data.filename);
  const problem = checkUpload(filename, bytes);
  if (problem) return { status: "rejected", message: problem };

  const user = await getCurrentUser().catch(() => null);
  if (!user) return { status: "signed_out" };
  try {
    const target = await withClaims(user.id, (tx) => openSubmissionForUpload(tx, submissionId));
    if (!target) return { status: "rejected", message: "Files can only be added to a report that is still open for editing." };
    const pathname = buildPath(target.ein, submissionId, filename);
    return { status: "ok", pathname, signature: signPath(user.id, submissionId, pathname), contentType: mimeFor(filename) };
  } catch {
    return { status: "error", message: "The upload could not start. Try again." };
  }
}

export async function recordBlobUpload(raw: unknown): Promise<UploadActionResult> {
  const parsed = z.object({ submissionId: z.uuid(), pathname: z.string().min(3).max(300), signature: z.string().min(10).max(200), filename: z.string().min(1).max(400) }).safeParse(raw);
  if (!parsed.success) return { status: "rejected", message: "That upload could not be confirmed." };
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { status: "signed_out" };
  const { submissionId, pathname, signature } = parsed.data;
  const filename = cleanFilename(parsed.data.filename);
  if (!pathSignatureValid(user.id, submissionId, pathname, signature)) return { status: "rejected", message: "That upload could not be confirmed." };

  const blob = await import("@vercel/blob");
  let meta: Awaited<ReturnType<typeof blob.head>>;
  try {
    meta = await blob.head(pathname);
  } catch {
    return { status: "error", message: "The uploaded file could not be found. Try again." };
  }
  const problem = checkUpload(filename, meta.size);
  if (problem || meta.contentType.split(";")[0] !== mimeFor(filename)) {
    await blob.del(meta.url).catch(() => undefined);
    return { status: "rejected", message: problem ?? "Use PDF, Word, Excel or CSV." };
  }
  try {
    const attachment = await withClaims(user.id, (tx) => insertAttachment(tx, { submissionId, pathname, filename, bytes: meta.size, mime: mimeFor(filename) }));
    return { status: "ok", attachment };
  } catch (error) {
    await blob.del(meta.url).catch(() => undefined);
    if (pgCode(error) === "42501") return { status: "rejected", message: "Files can only be added to a report that is still open for editing." };
    return { status: "error", message: "The file uploaded but could not be saved to the report. Try again." };
  }
}

export async function uploadLocalAttachment(formData: FormData): Promise<UploadActionResult> {
  const submissionId = z.uuid().safeParse(formData.get("submissionId"));
  const file = formData.get("file");
  if (!submissionId.success || !(file instanceof File)) return { status: "rejected", message: "That file could not be read." };
  const filename = cleanFilename(file.name);
  const problem = checkUpload(filename, file.size);
  if (problem) return { status: "rejected", message: problem };

  const user = await getCurrentUser().catch(() => null);
  if (!user) return { status: "signed_out" };
  try {
    const target = await withClaims(user.id, (tx) => openSubmissionForUpload(tx, submissionId.data));
    if (!target) return { status: "rejected", message: "Files can only be added to a report that is still open for editing." };
    const body = Buffer.from(await file.arrayBuffer());
    const invalid = contentLooksValid(filename, body.subarray(0, 4096));
    if (invalid) return { status: "rejected", message: invalid };
    const pathname = buildPath(target.ein, submissionId.data, filename);
    await putFile(pathname, body, mimeFor(filename));
    const attachment = await withClaims(user.id, (tx) => insertAttachment(tx, { submissionId: submissionId.data, pathname, filename, bytes: body.length, mime: mimeFor(filename) }));
    return { status: "ok", attachment };
  } catch (error) {
    if (pgCode(error) === "42501") return { status: "rejected", message: "Files can only be added to a report that is still open for editing." };
    return { status: "error", message: "The file could not be uploaded. Try again." };
  }
}
