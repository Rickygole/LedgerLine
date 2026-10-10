"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { pgCode, withClaims } from "@/lib/db";
import { nowEpochSeconds, nowIso, toIsoTimestamp } from "@/lib/dates";
import { dispatchFor } from "@/lib/outbox-dispatch";
import { loadAnswers, loadBudget, loadReport } from "@/lib/report/data";
import { plainTextReport } from "@/lib/report/format";
import { reportIssues } from "@/lib/report/issues";
import { writeDraft } from "@/lib/report/write";
import { UPLOAD_TICKET_SECONDS, attachmentLimitProblem, cleanFilename, contentLooksValid, insertAttachment, macroProblem, mimeFor, openSubmissionForUpload, pathSignatureValid, removeAttachmentRow, signPath } from "@/lib/report/attachments";
import type { AttachmentItem, PrepareUploadResult, SaveResult, SubmitResult, UploadActionResult } from "@/lib/report/types";
import { buildSnapshot } from "@/lib/snapshot";
import { FILE_TYPE_HELP } from "@/lib/report/upload-rules";
import { allowedWithin } from "@/lib/throttle";
import { buildPath, checkUpload, extensionOf, putFile } from "@/lib/storage";
import type { Answers } from "@/lib/rules/types";
import { CERTIFICATION_STATEMENT, certificationIssues, certificationNote, type Certification } from "@/lib/rules/certify";
import { VARIANCE_NOTE_KEY } from "@/lib/rules/spend";
import { blockingIssues, isVisible } from "@/lib/rules/validate";
import { plural } from "@/lib/format";

const cell = z.union([z.string().max(2000), z.number(), z.null()]);

const answerValue = z.union([z.string().max(30000), z.number(), z.boolean(), z.null(), z.array(z.record(z.string(), cell)).max(200)]);

const saveSchema = z.object({
  submissionId: z.uuid(),
  expectedLock: z.number().int().min(0),
  saveId: z.uuid(),
  answers: z.record(z.string(), answerValue),
  budget: z
    .array(
      z.object({
        rowId: z.uuid(),
        position: z.number().int().min(1).max(10000),
        category: z.enum(["PS", "OTPS"]),
        description: z.string().max(500),
        amount: z.number().min(-1e11).max(1e11),
        actual: z.number().min(-1e11).max(1e11).nullable().optional(),
      })
    )
    .max(500),
});

export async function saveDraft(raw: unknown): Promise<SaveResult> {
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Some entries could not be saved. Check for very long text." };
  const input = parsed.data;

  const user = await getCurrentUser().catch(() => null);
  if (!user) return { status: "signed_out" };

  try {
    return await withClaims(user.id, async (tx): Promise<SaveResult> => {
      const form = await loadReport(tx, input.submissionId);
      if (form && input.budget.length > form.definition.budget.maxLines) {
        const over = input.budget.length - form.definition.budget.maxLines;
        return { status: "error", message: `A budget can have at most ${form.definition.budget.maxLines} lines. This one has ${input.budget.length}. Remove ${over} ${plural(over, "line", "lines")} and your changes will save.` };
      }
      const touched = await tx.one<{ lock_version: number; updated_at: string }>(
        `UPDATE submission SET lock_version = lock_version + 1, updated_at = now(), updated_by = app.uid(), last_save_id = $3
         WHERE id = $1 AND status IN ('draft', 'returned') AND (lock_version = $2 OR (last_save_id = $3 AND lock_version = $2 + 1))
         RETURNING lock_version, updated_at`,
        [input.submissionId, input.expectedLock, input.saveId]
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
        return { status: "stale", by: current.full_name, at: toIsoTimestamp(current.updated_at) };
      }
      const report = await loadReport(tx, input.submissionId);
      if (!report) return { status: "error", message: "This report could not be found." };
      const allowedKeys = new Set([...report.definition.sections.flatMap((section) => section.questions.map((q) => q.key)), VARIANCE_NOTE_KEY]);
      await writeDraft(tx, { submissionId: input.submissionId, answers: input.answers, budget: input.budget, allowedKeys });
      return { status: "saved", lockVersion: touched.lock_version, savedAt: toIsoTimestamp(touched.updated_at) };
    });
  } catch (error) {
    const code = pgCode(error);
    if (code === "42501") return { status: "locked", message: "You do not have permission to change this report." };
    if (code === "40001") return { status: "stale", by: null, at: nowIso() };
    return { status: "error", message: "Couldn't save. Keep this tab open." };
  }
}

const UPLOADS_PER_HOUR = 60;

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
    if (!(await allowedWithin(`upload:${user.id}`, 60, UPLOADS_PER_HOUR))) return { status: "rejected", message: "You have started a lot of uploads in the last hour. Wait a while and try again." };
    const target = await withClaims(user.id, async (tx) => {
      const open = await openSubmissionForUpload(tx, submissionId);
      return open && { ...open, limit: await attachmentLimitProblem(tx, submissionId, bytes) };
    });
    if (!target) return { status: "rejected", message: "Files can only be added to a report that is still open for editing." };
    if (target.limit) return { status: "rejected", message: target.limit };
    const pathname = buildPath(target.ein, submissionId, filename);
    const expiresAt = nowEpochSeconds() + UPLOAD_TICKET_SECONDS;
    await withClaims(user.id, (tx) => tx.query("SELECT app.issue_upload_ticket($1, $2, to_timestamp($3))", [pathname, submissionId, expiresAt]));
    return { status: "ok", pathname, signature: signPath(user.id, submissionId, pathname, expiresAt), contentType: mimeFor(filename) };
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
  const refused: UploadActionResult = { status: "rejected", message: "That upload could not be confirmed." };
  if (!pathSignatureValid(user.id, submissionId, pathname, signature)) return refused;

  const signedName = pathname.split("/").pop() ?? "";
  const filename = cleanFilename(parsed.data.filename);
  if (extensionOf(filename) !== extensionOf(signedName)) return refused;

  let redeemed: boolean;
  try {
    redeemed = (await withClaims(user.id, (tx) => tx.one<{ ok: boolean }>("SELECT app.redeem_upload_ticket($1, $2) AS ok", [pathname, submissionId])))?.ok === true;
  } catch {
    return { status: "error", message: "The upload could not be confirmed. Try again." };
  }
  if (!redeemed) return refused;

  const blob = await import("@vercel/blob");
  const discard = (url: string) => blob.del(url).catch(() => undefined);
  let meta: Awaited<ReturnType<typeof blob.head>>;
  try {
    meta = await blob.head(pathname);
  } catch {
    return { status: "error", message: "The uploaded file could not be found. Try again." };
  }
  const problem = checkUpload(signedName, meta.size);
  if (problem || meta.contentType.split(";")[0] !== mimeFor(signedName)) {
    await discard(meta.url);
    return { status: "rejected", message: problem ?? FILE_TYPE_HELP };
  }
  const body = await fetch(meta.downloadUrl ?? meta.url, { headers: { authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } })
    .then(async (response) => (response.ok ? Buffer.from(await response.arrayBuffer()) : null))
    .catch(() => null);
  const invalid = body ? contentLooksValid(signedName, body.subarray(0, 4096)) ?? macroProblem(signedName, body) : "The uploaded file could not be checked. Try again.";
  if (invalid) {
    await discard(meta.url);
    return { status: "rejected", message: invalid };
  }
  try {
    const outcome = await withClaims<{ problem: string } | { attachment: AttachmentItem }>(user.id, async (tx) => {
      await tx.query("SELECT 1 FROM submission WHERE id = $1 FOR UPDATE", [submissionId]);
      if (!(await openSubmissionForUpload(tx, submissionId))) return { problem: "Files can only be added to a report that is still open for editing." };
      const limit = await attachmentLimitProblem(tx, submissionId, meta.size);
      if (limit) return { problem: limit };
      return { attachment: await insertAttachment(tx, { submissionId, pathname, filename, bytes: meta.size, mime: mimeFor(signedName) }) };
    });
    if ("problem" in outcome) {
      await discard(meta.url);
      return { status: "rejected", message: outcome.problem };
    }
    return { status: "ok", attachment: outcome.attachment };
  } catch (error) {
    await discard(meta.url);
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
    const target = await withClaims(user.id, async (tx) => {
      const open = await openSubmissionForUpload(tx, submissionId.data);
      return open && { ...open, limit: await attachmentLimitProblem(tx, submissionId.data, file.size) };
    });
    if (!target) return { status: "rejected", message: "Files can only be added to a report that is still open for editing." };
    if (target.limit) return { status: "rejected", message: target.limit };
    const body = Buffer.from(await file.arrayBuffer());
    const invalid = contentLooksValid(filename, body.subarray(0, 4096)) ?? macroProblem(filename, body);
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

export async function removeAttachment(raw: unknown): Promise<{ status: "ok" } | { status: "signed_out" } | { status: "error"; message: string }> {
  const parsed = z.object({ submissionId: z.uuid(), attachmentId: z.uuid() }).safeParse(raw);
  if (!parsed.success) return { status: "error", message: "That file could not be found." };
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { status: "signed_out" };
  try {
    const removed = await withClaims(user.id, (tx) => removeAttachmentRow(tx, parsed.data.submissionId, parsed.data.attachmentId));
    if (removed === 0) return { status: "error", message: "That file is already gone or the report is no longer open for editing." };
    return { status: "ok" };
  } catch {
    return { status: "error", message: "The file could not be removed. Try again." };
  }
}

const submitSchema = z.object({
  submissionId: z.uuid(),
  expectedLock: z.number().int().min(0),
  certification: z.object({ accepted: z.boolean(), name: z.string().max(400), title: z.string().max(400) }).optional(),
});

export async function submitReport(raw: unknown): Promise<SubmitResult> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "This report could not be submitted. Reload the page and try again." };
  const user = await getCurrentUser().catch(() => null);
  if (!user) return { status: "signed_out" };

  let outcome: SubmitResult | "done";
  try {
    outcome = await withClaims(user.id, async (tx): Promise<SubmitResult | "done"> => {
      await tx.query("SELECT 1 FROM submission WHERE id = $1 FOR UPDATE", [parsed.data.submissionId]);
      const report = await loadReport(tx, parsed.data.submissionId);
      if (!report) return { status: "error", message: "This report could not be found." };
      const { header, definition } = report;
      if (header.status !== "draft" && header.status !== "returned") {
        return { status: "error", message: "This report was already submitted." };
      }
      if (header.lockVersion !== parsed.data.expectedLock) {
        return { status: "stale", by: header.updatedByName, at: header.updatedAt };
      }

      const allowed = new Set(definition.sections.flatMap((section) => section.questions.map((q) => q.key)));
      const stored = await loadAnswers(tx, header.id);
      const budget = await loadBudget(tx, header.id);
      const files = await tx.query<{ path: string; filename: string; bytes: string; mime: string }>(
        "SELECT path, filename, bytes, mime FROM attachment WHERE submission_id = $1 AND removed_at IS NULL ORDER BY created_at, id",
        [header.id]
      );

      const answers: Answers = {};
      for (const section of definition.sections) {
        for (const question of section.questions) {
          if (!allowed.has(question.key) || !isVisible(question, stored.answers)) continue;
          const value = stored.answers[question.key];
          if (value !== undefined) answers[question.key] = value;
        }
      }
      if (definition.budget.enabled && stored.answers[VARIANCE_NOTE_KEY] !== undefined) answers[VARIANCE_NOTE_KEY] = stored.answers[VARIANCE_NOTE_KEY];

      const issues = blockingIssues(
        reportIssues({
          definition,
          answers: stored.answers,
          budget,
          awardAmount: header.awardAmount,
          orgEin: header.ein,
          orgName: header.orgName,
          period: { startsOn: header.startsOn, endsOn: header.endsOn },
        })
      );
      const certificationProblems = certificationIssues(parsed.data.certification);
      if (issues.length > 0 || certificationProblems.length > 0) return { status: "blocked", issues: [...issues, ...certificationProblems] };
      const certification: Certification = {
        statement: CERTIFICATION_STATEMENT,
        name: (parsed.data.certification?.name ?? "").trim(),
        title: (parsed.data.certification?.title ?? "").trim(),
        certifiedAt: nowIso(),
      };

      const attachments = files.map((file) => ({ path: file.path, filename: file.filename, bytes: Number(file.bytes), mime: file.mime }));
      const snapshot = buildSnapshot({ formVersionId: report.formVersionId, answers, budget, attachments, certification });
      const body = plainTextReport({
        title: header.initiativeName,
        referenceNo: header.referenceNo,
        periodLabel: header.periodLabel,
        orgName: header.orgName,
        ein: header.ein,
        awardAmount: header.awardAmount,
        definition,
        answers,
        budget: snapshot.budget as { position: number; category: "PS" | "OTPS"; description: string; amount: number; actual?: number }[],
        attachments,
        certification,
      });
      const outbox = {
        to: user.email,
        template: "submission_confirmation",
        subject: `Report received: ${header.initiativeName}, ${header.periodLabel}`,
        body,
      };
      await tx.query("SELECT * FROM app.transition_submission($1, 'submit', $2, $3::jsonb, $4, $5::jsonb, NULL)", [
        header.id,
        parsed.data.expectedLock,
        JSON.stringify(snapshot),
        certificationNote(certification),
        JSON.stringify(outbox),
      ]);
      return "done";
    });
  } catch (error) {
    const code = pgCode(error);
    if (code === "40001") return { status: "stale", by: null, at: nowIso() };
    if (code === "42501") return { status: "error", message: "Only your organization can submit this report." };
    if (code === "23514") return { status: "error", message: "This report can no longer be submitted. It may already have been sent." };
    return { status: "error", message: "The report could not be submitted. Your answers are saved. Try again." };
  }
  if (outcome !== "done") return outcome;
  await dispatchFor(user.id, { submissionId: parsed.data.submissionId });
  redirect(`/portal/reports/${parsed.data.submissionId}/submitted`);
}
