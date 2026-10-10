"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionFailure, dbErrorMessage, failure, success, type ActionResult, type ActionState } from "@/lib/actions";
import { REVIEW_ROLES, requireUser } from "@/lib/auth";
import { pgCode, withClaims } from "@/lib/db";
import { logError } from "@/lib/ops/log";
import { appOrigin } from "@/lib/origin";
import { dispatchFor } from "@/lib/outbox-dispatch";
import { draftReturnNote } from "@/lib/ai/return-note";
import { loadSubmissionDetail } from "@/lib/finance/review/detail";
import { REVIEW_ERRORS, STALE_MESSAGE } from "@/lib/finance/review/errors";
import {
  buildConcerns,
  containsRuleId,
  lineDiff,
  PRESET_CONCERNS,
  type Concern,
} from "@/lib/finance/review/return-note-core";
import { buildSnapshot } from "@/lib/snapshot";
import { isUuid } from "@/lib/ids";
import { introducedBlockingIssues } from "@/lib/rules/correction";
import { identityProblem } from "@/lib/rules/identity";
import { VARIANCE_NOTE_KEY } from "@/lib/rules/spend";
import { validateSubmission, visibleAnswers } from "@/lib/rules/validate";
import { writeAudit } from "@/lib/audit";

export type NoteDraft =
  | { ok: true; text: string; mode: "live" | "fallback"; aiActionId: string | null; ruleIds: string[]; dropped: number }
  | { ok: false; message: string };

const lockField = z
  .string()
  .regex(/^\d{1,9}$/)
  .transform(Number);

const updateSchema = z.object({
  submissionId: z.guid(),
  lockVersion: z.number().int().min(0),
  text: z.string(),
  aiActionId: z.guid().nullable(),
});

function refresh(id: string) {
  revalidatePath(`/finance/submissions/${id}`);
  revalidatePath("/finance");
  revalidatePath("/finance/submissions");
  revalidatePath("/finance/flagged");
}

async function concernsFor(
  tx: Parameters<Parameters<typeof withClaims>[1]>[0],
  id: string,
): Promise<{ all: Concern[] } | null> {
  const detail = await loadSubmissionDetail(tx, id);
  if (!detail) return null;
  const { row } = detail;
  const rules = buildConcerns({
    definition: row.definition,
    issues: row.issues,
    budget: row.budget,
    award: row.award,
    status: row.status,
    answers: row.answers,
    openFlags: row.openFlags,
  });
  return { all: [...rules, ...PRESET_CONCERNS] };
}

export async function transitionAction(_prev: ActionState, formData: FormData): Promise<ActionResult> {
  const user = await requireUser(REVIEW_ROLES);
  const id = String(formData.get("submissionId") ?? "");
  const action = String(formData.get("action") ?? "");
  const lock = lockField.safeParse(formData.get("lockVersion"));
  if (!isUuid(id) || !["start_review", "accept"].includes(action) || !lock.success) {
    return failure("That action is not available.");
  }
  try {
    const problem = await withClaims(user.id, async (tx) => {
      if (action === "accept") {
        await tx.query("SELECT 1 FROM submission WHERE id = $1 FOR UPDATE", [id]);
        const issues = (await loadSubmissionDetail(tx, id))?.row.issues ?? [];
        if (issues.length > 0)
          return `Resolve these problems before accepting this report: ${issues.map((issue) => issue.message.replace(/\.$/, "")).join("; ")}.`;
      }
      await tx.query("SELECT * FROM app.transition_submission($1, $2, $3, NULL, NULL, NULL, NULL)", [
        id,
        action,
        lock.data,
      ]);
      return null;
    });
    if (problem) return failure(problem);
  } catch (error) {
    return actionFailure("transition_action_failed", error, REVIEW_ERRORS);
  }
  refresh(id);
  return success(action === "accept" ? "Report accepted." : "Review started. The report is now in review.");
}

export async function draftNoteAction(submissionId: string, concernIds: string[]): Promise<NoteDraft> {
  const user = await requireUser(REVIEW_ROLES);
  try {
    return await withClaims(user.id, async (tx) => {
      const found = await concernsFor(tx, submissionId);
      if (!found) return { ok: false as const, message: "That report could not be found." };
      const chosen = found.all.filter((c) => concernIds.includes(c.id));
      if (chosen.length === 0)
        return { ok: false as const, message: "Choose at least one concern to include in the note." };
      const draft = await draftReturnNote(tx, { submissionId, concerns: chosen });
      return {
        ok: true as const,
        text: draft.text,
        mode: draft.mode,
        aiActionId: draft.aiActionId,
        ruleIds: [...new Set(draft.sentences.flatMap((s) => s.ruleIds))],
        dropped: draft.dropped,
      };
    });
  } catch (error) {
    await logError("draft_note_failed", error);
    return { ok: false, message: dbErrorMessage(error, REVIEW_ERRORS) };
  }
}

export async function sendUpdateAction(raw: {
  submissionId: string;
  lockVersion: number;
  text: string;
  aiActionId: string | null;
}): Promise<ActionResult> {
  const user = await requireUser(REVIEW_ROLES);
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return failure("That action is not available.");
  const input = parsed.data;
  const note = input.text.trim();
  if (!note) return failure("Write a note before sending. The organization needs to know what to change.");
  if (containsRuleId(note))
    return failure("Remove rule ids such as BR-022 from the note. Organizations should only see plain language.");
  if (note.length > 4000) return failure("Shorten the note to 4,000 characters or fewer.");
  const origin = await appOrigin();
  try {
    const sent = await withClaims(user.id, async (tx) => {
      const detail = await loadSubmissionDetail(tx, input.submissionId);
      if (!detail) return "That report could not be found.";
      if (!detail.primaryContact)
        return "This organization has no contact email on file, so the request cannot be sent.";
      if (input.aiActionId) {
        const draft = await tx.one<{ output: { text?: string } }>(
          "SELECT output FROM ai_action WHERE id = $1 AND submission_id = $2 AND feature = 'return_note'",
          [input.aiActionId, input.submissionId],
        );
        if (!draft) return "The drafted note could not be found. Draft the note again.";
        const original = draft.output.text ?? "";
        const diff = lineDiff(original, note);
        const edited = diff.added.length > 0 || diff.removed.length > 0;
        await tx.query(
          "UPDATE ai_action SET status = $2, approver = app.uid(), decided_at = now(), edit_diff = $3::jsonb WHERE id = $1",
          [input.aiActionId, edited ? "edited" : "accepted", JSON.stringify({ ...diff, finalText: note })],
        );
      }
      const { row } = detail;
      const body = [
        `Hello ${detail.primaryContact.name},`,
        "",
        `Council Finance reviewed report ${row.referenceNo} for ${row.initiativeName}, ${detail.periodLabel}, and needs the following updates before it can be accepted.`,
        "",
        note,
        "",
        `Sign in to LedgerLine to update your report: ${origin}/portal`,
      ].join("\n");
      const outbox = {
        to: detail.primaryContact.email,
        template: "update_requested",
        subject: `Update requested: ${row.initiativeName}, ${detail.periodLabel}`,
        body,
      };
      await tx.query("SELECT * FROM app.transition_submission($1, 'request_update', $2, NULL, $3, $4::jsonb, $5)", [
        input.submissionId,
        input.lockVersion,
        note,
        JSON.stringify(outbox),
        input.aiActionId,
      ]);
      return null;
    });
    if (sent) return failure(sent);
  } catch (error) {
    return actionFailure("send_update_action_failed", error, REVIEW_ERRORS);
  }
  await dispatchFor(user.id, { submissionId: input.submissionId });
  refresh(input.submissionId);
  return success("Update request sent. The organization will see the note above its report.");
}

export async function addFlagAction(_prev: ActionState, formData: FormData): Promise<ActionResult> {
  const user = await requireUser(REVIEW_ROLES);
  const id = String(formData.get("submissionId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return failure("Add a note that says why this report is flagged.");
  if (note.length > 1000) return failure("Shorten the note to 1,000 characters or fewer.");
  try {
    const refused = await withClaims(user.id, async (tx) => {
      const current = await tx.one<{ status: string }>("SELECT status FROM submission WHERE id = $1", [id]);
      if (!current) return "That report could not be found.";
      if (current.status === "draft") return "This report has not been submitted yet, so it cannot be flagged.";
      const flag = await tx.one<{ id: string }>(
        "INSERT INTO flag (submission_id, kind, source, note, created_by) VALUES ($1, 'manual', 'user', $2, app.uid()) RETURNING id",
        [id, note],
      );
      await writeAudit(tx, {
        entity: "submission",
        entityId: id,
        action: "flag_add",
        note,
        after: { flag_id: flag?.id, kind: "manual" },
      });
      return null;
    });
    if (refused) return failure(refused);
  } catch (error) {
    return actionFailure("add_flag_action_failed", error, REVIEW_ERRORS);
  }
  refresh(id);
  return success("Flag added.");
}

export async function resolveFlagAction(_prev: ActionState, formData: FormData): Promise<ActionResult> {
  const user = await requireUser(REVIEW_ROLES);
  const id = String(formData.get("submissionId") ?? "");
  const flagId = String(formData.get("flagId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  if (!["resolved", "dismissed"].includes(outcome)) return failure("That action is not available.");
  try {
    const changed = await withClaims(user.id, async (tx) => {
      const row = await tx.one<{ id: string; note: string | null }>(
        "UPDATE flag SET status = $3, resolved_by = app.uid(), resolved_at = now() WHERE id = $1 AND submission_id = $2 AND status = 'open' RETURNING id, note",
        [flagId, id, outcome],
      );
      if (!row) return false;
      await writeAudit(tx, {
        entity: "submission",
        entityId: id,
        action: outcome === "resolved" ? "flag_resolve" : "flag_dismiss",
        note: row.note,
        before: { flag_id: flagId, status: "open" },
        after: { flag_id: flagId, status: outcome },
      });
      return true;
    });
    if (!changed) return failure("That flag is already closed. Reload the page to see its current state.");
  } catch (error) {
    return actionFailure("resolve_flag_action_failed", error, REVIEW_ERRORS);
  }
  refresh(id);
  return success(outcome === "resolved" ? "Flag resolved." : "Flag dismissed.");
}

export async function correctionAction(_prev: ActionState, formData: FormData): Promise<ActionResult> {
  const user = await requireUser(REVIEW_ROLES);
  const id = String(formData.get("submissionId") ?? "");
  const key = String(formData.get("questionKey") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const lock = lockField.safeParse(formData.get("lockVersion"));
  if (!lock.success) return failure("That action is not available.");
  if (!key) return failure("Choose the question to correct.");
  if (!reason) return failure("Enter a reason. Every correction is recorded with its reason.");
  if (reason.length > 2000) return failure("Shorten the reason to 2,000 characters or fewer.");
  try {
    const problem = await withClaims(user.id, async (tx) => {
      await tx.query("SELECT 1 FROM submission WHERE id = $1 FOR UPDATE", [id]);
      const detail = await loadSubmissionDetail(tx, id);
      if (!detail || !detail.row.definition) return "That report could not be found.";
      const { row } = detail;
      if (row.lockVersion !== lock.data) return STALE_MESSAGE;
      const question = row.definition!.sections.flatMap((s) => s.questions).find((q) => q.key === key);
      if (!question || question.type === "table") return "That question cannot be corrected here.";
      if (String(row.answers[key] ?? "") === value)
        return "The new value is the same as the current value. Enter a different value to correct.";
      const answers = { ...row.answers, [key]: value };
      const issues = validateSubmission({
        definition: row.definition!,
        answers,
        budget: row.budget,
        awardAmount: row.award,
      }).filter((i) => i.field === key && i.severity === "block");
      if (issues.length > 0) return issues[0].message;
      const introduced = introducedBlockingIssues(
        { definition: row.definition!, answers: row.answers, budget: row.budget, awardAmount: row.award },
        key,
        value,
      );
      if (introduced.length > 0) {
        return `This correction would leave the report incomplete. ${introduced[0].message}`;
      }
      const identity = identityProblem(key, value, { legalName: row.orgName, ein: row.ein });
      if (identity) return identity;
      const attachments = await tx.query<{ path: string; filename: string; bytes: string; mime: string }>(
        "SELECT path, filename, bytes::text AS bytes, mime FROM attachment WHERE submission_id = $1 AND removed_at IS NULL",
        [id],
      );
      const snapshot = buildSnapshot({
        formVersionId: row.formVersionId!,
        answers: {
          ...visibleAnswers(row.definition!, answers),
          ...(answers[VARIANCE_NOTE_KEY] ? { [VARIANCE_NOTE_KEY]: answers[VARIANCE_NOTE_KEY] } : {}),
        },
        budget: row.budget,
        attachments: attachments.map((a) => ({
          path: a.path,
          filename: a.filename,
          bytes: Number(a.bytes),
          mime: a.mime,
        })),
        certification: detail.certification ?? undefined,
      });
      await tx.query("SELECT app.correct_answer($1, $2, $3::jsonb, $4, $5::jsonb)", [
        id,
        key,
        JSON.stringify(value),
        reason,
        JSON.stringify(snapshot),
      ]);
      return null;
    });
    if (problem) return failure(problem);
  } catch (error) {
    if (pgCode(error) === "42501")
      return failure("Only Finance analysts and administrators can correct a submitted answer.");
    return actionFailure("correction_action_failed", error, REVIEW_ERRORS);
  }
  refresh(id);
  return success("Correction saved as a new revision.");
}
