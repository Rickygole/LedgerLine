"use server";

import mammoth from "mammoth";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { pgCode, withClaims } from "@/lib/db";
import { draftFormFromDocx, type DraftResult } from "@/lib/ai/form-draft";
import { cleanDefinition, validateDefinition } from "@/lib/forms/editor/definition";
import { checkField, mergeFields, splitParagraphs, type ProposedField } from "@/lib/forms/editor/draft-core";
import { MAX_UPLOAD_BYTES } from "@/lib/forms/editor/limits";
import type { FormDefinition } from "@/lib/rules/types";

type Failure = { ok: false; errors: string[] };

function fail(...errors: string[]): Failure {
  return { ok: false, errors };
}

function mapError(error: unknown): string {
  const code = pgCode(error);
  if (code === "42501") return "Only finance administrators can change or publish a form.";
  if (code === "23514") return "Only drafts can be changed or published. This version is already published.";
  return "Something went wrong and nothing was saved. Try again.";
}

export async function saveDefinition(formId: string, definition: FormDefinition): Promise<{ ok: true } | Failure> {
  const user = await requireUser(["finance_admin"]);
  const clean = cleanDefinition(definition);
  const errors = validateDefinition(clean);
  if (errors.length > 0) return fail(...errors);
  try {
    const saved = await withClaims(user.id, async (tx) => {
      const before = await tx.one<{ definition: FormDefinition }>("SELECT definition FROM form_version WHERE id = $1 AND status = 'draft'", [formId]);
      if (!before) return false;
      const updated = await tx.query("UPDATE form_version SET definition = $2 WHERE id = $1 AND status = 'draft' RETURNING id", [formId, JSON.stringify(clean)]);
      if (updated.length === 0) return false;
      const count = (d: FormDefinition) => d.sections.reduce((n, s) => n + s.questions.length, 0);
      await tx.query("SELECT app.write_audit($1, $2, $3, $4, $5::jsonb, $6::jsonb, NULL)", [
        "form_version",
        formId,
        "form_edit",
        null,
        JSON.stringify({ questions: count(before.definition) }),
        JSON.stringify({ questions: count(clean) }),
      ]);
      return true;
    });
    if (!saved) return fail("This version is no longer a draft, so it cannot be changed.");
  } catch (error) {
    return fail(mapError(error));
  }
  revalidatePath(`/finance/forms/${formId}`);
  return { ok: true };
}

export async function publishForm(formId: string): Promise<{ ok: true; version: number; initiativeId: string } | Failure> {
  const user = await requireUser(["finance_admin"]);
  try {
    return await withClaims(user.id, async (tx) => {
      const form = await tx.one<{ initiative_id: string; definition: FormDefinition }>("SELECT initiative_id, definition FROM form_version WHERE id = $1", [formId]);
      if (!form) return fail("That form version was not found.");
      const errors = validateDefinition(form.definition);
      if (errors.length > 0) return fail("Fix these problems before publishing.", ...errors);
      const row = await tx.one<{ version: number }>("SELECT app.publish_form($1) AS version", [formId]);
      return { ok: true as const, version: row?.version ?? 0, initiativeId: form.initiative_id };
    });
  } catch (error) {
    return fail(mapError(error));
  } finally {
    revalidatePath(`/finance/forms/${formId}`);
  }
}

export async function analyzeTemplate(formId: string, formData: FormData): Promise<({ ok: true } & DraftResult) | Failure> {
  const user = await requireUser(["finance_admin"]);
  const file = formData.get("template");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a Word file (.docx) to import.");
  if (!file.name.toLowerCase().endsWith(".docx")) return fail("Only Word files that end in .docx can be imported.");
  if (file.size > MAX_UPLOAD_BYTES) return fail("That file is larger than 2 MB. Save a smaller copy and try again.");
  let paragraphs: string[];
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
    paragraphs = splitParagraphs(result.value);
  } catch {
    return fail("That file could not be read as a Word document. Check that it is a .docx file.");
  }
  if (paragraphs.length === 0) return fail("No text was found in that document.");
  if (paragraphs.length > 400) return fail("That template is too long to import. Split it into smaller documents.");
  try {
    const result = await withClaims(user.id, async (tx) => {
      const form = await tx.one<{ initiative_id: string }>("SELECT initiative_id FROM form_version WHERE id = $1 AND status = 'draft'", [formId]);
      if (!form) return null;
      return draftFormFromDocx({ tx, initiativeId: form.initiative_id, paragraphs });
    });
    if (!result) return fail("Import is available only on draft versions.");
    return { ok: true, ...result };
  } catch (error) {
    return fail(mapError(error));
  }
}

export type SubmittedField = ProposedField & { id: number };

type OriginalOutput = { questions: ProposedField[]; paragraphs: string[] };

export async function applyDraft(formId: string, aiActionId: string, submitted: SubmittedField[]): Promise<{ ok: true; summary: string } | Failure> {
  const user = await requireUser(["finance_admin"]);
  if (submitted.length === 0) return fail("Keep at least one field, or discard the draft.");
  try {
    return await withClaims(user.id, async (tx) => {
      const action = await tx.one<{ output: OriginalOutput; status: string; initiative_id: string | null; mode: string }>(
        "SELECT output, status, initiative_id, mode FROM ai_action WHERE id = $1 AND feature = 'form_draft' FOR UPDATE",
        [aiActionId]
      );
      if (!action || action.status !== "proposed") return fail("This draft was already decided. Import the template again to start over.");
      const form = await tx.one<{ initiative_id: string; definition: FormDefinition }>("SELECT initiative_id, definition FROM form_version WHERE id = $1 AND status = 'draft' FOR UPDATE", [formId]);
      if (!form || form.initiative_id !== action.initiative_id) return fail("This draft belongs to a different form.");

      const { questions: original, paragraphs } = action.output;
      const fields: ProposedField[] = [];
      const problems: string[] = [];
      for (const item of submitted) {
        const { id, ...field } = item;
        if (!Number.isInteger(id) || id < 0 || id >= original.length) return fail("A field in this draft was not recognized.");
        const check = checkField(paragraphs, field);
        if (!check.ok) problems.push(`"${field.label || "Untitled field"}": ${check.problems.join(", ")}`);
        fields.push(field);
      }
      if (problems.length > 0) return fail("Fix or remove these fields first.", ...problems);

      const edited: { id: number; label: string; changed: string[] }[] = [];
      for (const item of submitted) {
        const base = original[item.id];
        const names = ["label", "help", "type", "required", "options", "max_words", "section", "library_key", "citation"] as const;
        const same = (name: (typeof names)[number]) => (name === "citation" ? base.citation.paragraph === item.citation.paragraph && base.citation.quote === item.citation.quote : JSON.stringify(base[name] ?? null) === JSON.stringify(item[name] ?? null));
        const changed: string[] = names.filter((name) => !same(name));
        if (changed.length > 0) edited.push({ id: item.id, label: item.label, changed });
      }
      const keptIds = new Set(submitted.map((item) => item.id));
      const removed = original.map((field, id) => ({ field, id })).filter(({ id }) => !keptIds.has(id)).map(({ field }) => field.label);

      const merged = mergeFields(form.definition, fields);
      const errors = validateDefinition(merged.definition);
      if (errors.length > 0) return fail(...errors);

      await tx.query("UPDATE form_version SET definition = $2 WHERE id = $1 AND status = 'draft'", [formId, JSON.stringify(merged.definition)]);
      const status = edited.length > 0 || removed.length > 0 ? "edited" : "accepted";
      const diff = { proposed: original.length, kept: submitted.length, removed, edited, added_keys: merged.added, linked_library_keys: merged.linked, already_in_form: merged.alreadyPresent };
      await tx.query("UPDATE ai_action SET status = $2, approver = app.uid(), decided_at = now(), edit_diff = $3 WHERE id = $1", [aiActionId, status, JSON.stringify(diff)]);
      await tx.query("SELECT app.write_audit($1, $2, $3, $4, NULL, $5::jsonb, $6)", [
        "form_version",
        formId,
        "ai_draft_applied",
        `Applied ${submitted.length} of ${original.length} proposed fields (${status}, ${action.mode} mode)`,
        JSON.stringify({ added: merged.added.length, linked_library: merged.linked.length, already_in_form: merged.alreadyPresent.length, removed: removed.length }),
        aiActionId,
      ]);
      revalidatePath(`/finance/forms/${formId}`);
      const summary = `${merged.added.length + merged.linked.length} questions added${merged.alreadyPresent.length ? `, ${merged.alreadyPresent.length} already in the form` : ""}${removed.length ? `, ${removed.length} removed from the draft` : ""}.`;
      return { ok: true as const, summary };
    });
  } catch (error) {
    return fail(mapError(error));
  }
}

export async function rejectDraft(formId: string, aiActionId: string): Promise<{ ok: true } | Failure> {
  const user = await requireUser(["finance_admin"]);
  try {
    return await withClaims(user.id, async (tx) => {
      const updated = await tx.query("UPDATE ai_action SET status = 'rejected', approver = app.uid(), decided_at = now() WHERE id = $1 AND feature = 'form_draft' AND status = 'proposed' RETURNING id", [aiActionId]);
      if (updated.length === 0) return fail("This draft was already decided.");
      await tx.query("SELECT app.write_audit($1, $2, $3, $4, NULL, NULL, $5)", ["form_version", formId, "ai_draft_discarded", "Draft discarded without changes", aiActionId]);
      return { ok: true as const };
    });
  } catch (error) {
    return fail(mapError(error));
  }
}
