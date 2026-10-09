"use client";

import { AlertTriangle, BookOpen, CheckCircle2, FileUp, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { analyzeTemplate, applyDraft, rejectDraft } from "@/app/finance/forms/[formId]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldError, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/status-badge";
import { DRAFTABLE_TYPES, TYPE_LABEL } from "@/lib/forms/editor/definition";
import { LIBRARY_KEYS, SECTION_KEYS, checkField, type ProposedField } from "@/lib/forms/editor/draft-core";
import { MAX_UPLOAD_BYTES } from "@/lib/forms/editor/limits";
import { STANDARD_QUESTIONS } from "@/lib/forms/standard";
import type { FieldType } from "@/lib/rules/types";

type Mode = "live" | "replay" | "fallback";

type Analysis = {
  mode: Mode;
  modeLabel: string;
  model: string | null;
  inputSha256: string;
  paragraphs: string[];
  notices: string[];
  aiActionId: string;
  fields: { id: number; field: ProposedField }[];
};

type Row = { id: number; field: ProposedField; removed: boolean; editing: boolean };

const SECTION_LABEL: Record<string, string> = { performance: "Program performance", narrative: "Narrative", organization: "Organization and contact" };

function Highlighted({ paragraph, quote }: { paragraph: string; quote: string }) {
  const collapsedParagraph = paragraph.replace(/\s+/g, " ");
  const collapsedQuote = quote.replace(/\s+/g, " ").trim();
  const at = collapsedQuote ? collapsedParagraph.indexOf(collapsedQuote) : -1;
  if (at < 0) return <span>{collapsedParagraph}</span>;
  return (
    <span>
      {collapsedParagraph.slice(0, at)}
      <mark className="rounded bg-warn-bg px-0.5 font-semibold text-ink">{collapsedParagraph.slice(at, at + collapsedQuote.length)}</mark>
      {collapsedParagraph.slice(at + collapsedQuote.length)}
    </span>
  );
}

export function ImportPanel({ formId, initiallyOpen, onApplied, onClose }: { formId: string; initiallyOpen?: boolean; onApplied: (summary: string) => void; onClose: () => void }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fileId = useId();

  function showErrors(list: string[]) {
    setErrors(list);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function upload(formData: FormData) {
    const file = formData.get("template");
    if (!(file instanceof File) || file.size === 0) return showErrors(["Choose a Word file (.docx) to import."]);
    if (file.size > MAX_UPLOAD_BYTES) return showErrors(["That file is larger than 2 MB. Save a smaller copy and try again."]);
    startTransition(async () => {
      const result = await analyzeTemplate(formId, formData);
      if (!result.ok) return showErrors(result.errors);
      setErrors([]);
      setAnalysis(result);
      setRows(result.fields.map(({ id, field }) => ({ id, field, removed: false, editing: false })));
    });
  }

  function patchRow(id: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function patchField(id: number, patch: Partial<ProposedField>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, field: { ...row.field, ...patch } } : row)));
  }

  const kept = rows.filter((row) => !row.removed);
  const checks = analysis ? kept.map((row) => ({ row, check: checkField(analysis.paragraphs, row.field) })) : [];
  const blocked = checks.filter(({ check }) => !check.ok).length;

  function approve() {
    if (!analysis) return;
    startTransition(async () => {
      const result = await applyDraft(
        formId,
        analysis.aiActionId,
        kept.map((row) => ({ id: row.id, ...row.field }))
      );
      if (!result.ok) return showErrors(result.errors);
      onApplied(result.summary);
    });
  }

  function discard() {
    if (!analysis) return onClose();
    startTransition(async () => {
      const result = await rejectDraft(formId, analysis.aiActionId);
      if (!result.ok) return showErrors(result.errors);
      onClose();
    });
  }

  return (
    <Card className="mb-6" role="region" aria-label="Import a legacy Word template">
      <CardHeader
        title="Import legacy Word template"
        description="Upload an existing Word report template. A draft of the form is proposed for you to review. Nothing changes until you approve it."
        actions={
          <Button variant="ghost" size="sm" onClick={analysis ? discard : onClose} disabled={pending}>
            {analysis ? "Discard draft" : "Close"}
          </Button>
        }
      />
      <CardBody className="space-y-5">
        {errors.length > 0 ? (
          <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-4 py-3 text-sm text-bad focus:outline-none focus:ring-2 focus:ring-bad/30">
            <p className="font-semibold">{errors.length === 1 ? "There is a problem." : "There are problems to fix."}</p>
            <ul className="mt-1 list-disc pl-5">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {!analysis ? (
          <form action={upload} className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <Label htmlFor={fileId}>Word template (.docx, up to 2 MB)</Label>
              <Input id={fileId} ref={fileRef} name="template" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="h-auto py-2" autoFocus={initiallyOpen} />
            </div>
            <Button type="submit" disabled={pending}>
              <FileUp className="h-4 w-4" aria-hidden="true" />
              {pending ? "Reading template" : "Draft the form"}
            </Button>
          </form>
        ) : (
          <>
            <div className="rounded-md border border-warn/30 bg-warn-bg px-4 py-3 text-sm" role="note">
              <p className="flex items-center gap-2 font-semibold text-warn">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                AI draft. Needs your review.
              </p>
              <p className="mt-1 text-ink">
                {analysis.modeLabel}
                {analysis.model ? ` (${analysis.model})` : ""}. The proposals below are not part of the form until you approve them. Your name and the decision are recorded in the audit log.
              </p>
              <p className="mt-1 text-xs text-muted">Template fingerprint {analysis.inputSha256.slice(0, 16)}</p>
              {analysis.notices.map((notice) => (
                <p key={notice} className="mt-2 flex items-start gap-2 text-ink">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                  {notice}
                </p>
              ))}
            </div>

            <ul className="space-y-3">
              {rows.map((row) => {
                const check = checkField(analysis.paragraphs, row.field);
                const library = row.field.library_key ? STANDARD_QUESTIONS.find((q) => q.key === row.field.library_key) : undefined;
                const paragraphText = analysis.paragraphs[row.field.citation.paragraph - 1];
                return (
                  <li key={row.id} className={`rounded-lg border bg-white ${row.removed ? "border-line opacity-60" : check.ok ? "border-line" : "border-bad"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold text-ink ${row.removed ? "line-through" : ""}`}>{row.field.label || "Untitled field"}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge>{TYPE_LABEL[row.field.type as FieldType] ?? row.field.type}</Badge>
                          <Badge tone={row.field.required ? "info" : "neutral"}>{row.field.required ? "Required" : "Optional"}</Badge>
                          <Badge>{SECTION_LABEL[row.field.section] ?? row.field.section}</Badge>
                          {library ? (
                            <Badge tone="info" icon={BookOpen}>
                              Standard library: {library.label}
                            </Badge>
                          ) : null}
                          {row.removed ? <Badge tone="neutral">Removed</Badge> : null}
                        </div>
                        {row.field.options?.length ? <p className="mt-1.5 text-xs text-muted">Choices: {row.field.options.join(", ")}</p> : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {row.removed ? (
                          <Button variant="secondary" size="sm" onClick={() => patchRow(row.id, { removed: false })}>
                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                            Restore
                          </Button>
                        ) : (
                          <>
                            <Button variant="secondary" size="sm" aria-expanded={row.editing} onClick={() => patchRow(row.id, { editing: !row.editing })}>
                              {row.editing ? "Done" : "Edit"}
                            </Button>
                            <Button variant="ghost" size="sm" aria-label={`Remove ${row.field.label}`} onClick={() => patchRow(row.id, { removed: true, editing: false })}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {!row.removed ? (
                      <div className="border-t border-line bg-surface/60 px-4 py-2.5 text-xs text-muted">
                        <span className="font-semibold text-ink">Template paragraph {row.field.citation.paragraph}</span>
                        <p className="mt-0.5 text-sm text-ink">
                          {paragraphText !== undefined ? <Highlighted paragraph={paragraphText} quote={row.field.citation.quote} /> : <span className="text-muted">No such paragraph.</span>}
                        </p>
                        {!check.citationOk ? (
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-bad">
                            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                            Citation not found in the template
                          </p>
                        ) : (
                          <p className="mt-1 flex items-center gap-1.5 text-ok">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Quote verified against the template
                          </p>
                        )}
                        {check.problems.filter((problem) => problem !== "Citation not found in the template").map((problem) => (
                          <FieldError key={problem}>{problem}</FieldError>
                        ))}
                      </div>
                    ) : null}
                    {row.editing && !row.removed ? <FieldEditor row={row} onChange={(patch) => patchField(row.id, patch)} /> : null}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-sm text-muted" aria-live="polite">
                {kept.length} of {rows.length} fields kept.
                {blocked > 0 ? ` ${blocked} cannot be approved until fixed or removed.` : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={discard} disabled={pending}>
                  Discard draft
                </Button>
                <Button onClick={approve} disabled={pending || blocked > 0 || kept.length === 0}>
                  {pending ? "Applying" : `Approve ${kept.length} field${kept.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function FieldEditor({ row, onChange }: { row: Row; onChange: (patch: Partial<ProposedField>) => void }) {
  const id = useId();
  const { field } = row;
  return (
    <div className="grid gap-4 border-t border-line px-4 py-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor={`${id}-label`}>Label</Label>
        <Input id={`${id}-label`} value={field.label} onChange={(e) => onChange({ label: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${id}-help`}>Help text</Label>
        <Input id={`${id}-help`} value={field.help ?? ""} onChange={(e) => onChange({ help: e.target.value || undefined })} />
      </div>
      <div>
        <Label htmlFor={`${id}-type`}>Answer type</Label>
        <Select id={`${id}-type`} value={field.type} onChange={(e) => onChange({ type: e.target.value, options: e.target.value === "select" ? (field.options?.length ? field.options : ["Option 1", "Option 2"]) : undefined })}>
          {DRAFTABLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABEL[type]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${id}-section`}>Section</Label>
        <Select id={`${id}-section`} value={field.section} onChange={(e) => onChange({ section: e.target.value })}>
          {SECTION_KEYS.map((section) => (
            <option key={section} value={section}>
              {SECTION_LABEL[section]}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-ink">
        <input type="checkbox" className="h-4 w-4 rounded border-line" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} />
        Required
      </label>
      <div>
        <Label htmlFor={`${id}-lib`}>Standard library question</Label>
        <Select id={`${id}-lib`} value={field.library_key ?? ""} onChange={(e) => onChange({ library_key: e.target.value || undefined })}>
          <option value="">None, create a new question</option>
          {LIBRARY_KEYS.map((key) => (
            <option key={key} value={key}>
              {STANDARD_QUESTIONS.find((q) => q.key === key)?.label}
            </option>
          ))}
        </Select>
      </div>
      {field.type === "select" ? (
        <div className="sm:col-span-2">
          <Label htmlFor={`${id}-options`}>Choices</Label>
          <Hint>One choice per line.</Hint>
          <Textarea id={`${id}-options`} className="min-h-20" value={(field.options ?? []).join("\n")} onChange={(e) => onChange({ options: e.target.value.split("\n") })} />
        </div>
      ) : null}
      {field.type === "textarea" ? (
        <div>
          <Label htmlFor={`${id}-words`}>Maximum words</Label>
          <Input id={`${id}-words`} type="number" min={1} className="num" value={field.max_words ?? ""} onChange={(e) => onChange({ max_words: e.target.value ? Number(e.target.value) : undefined })} />
        </div>
      ) : null}
      <div>
        <Label htmlFor={`${id}-para`}>Cited paragraph number</Label>
        <Input id={`${id}-para`} type="number" min={1} className="num" value={field.citation.paragraph} onChange={(e) => onChange({ citation: { ...field.citation, paragraph: Number(e.target.value) } })} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${id}-quote`}>Quoted text from that paragraph</Label>
        <Hint>Must be copied exactly from the template.</Hint>
        <Input id={`${id}-quote`} value={field.citation.quote} onChange={(e) => onChange({ citation: { ...field.citation, quote: e.target.value } })} />
      </div>
    </div>
  );
}
