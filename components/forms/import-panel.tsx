"use client";

import { AlertTriangle, BookOpen, Check, CheckCircle2, FileUp, Pencil, Undo2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { analyzeTemplate, applyDraft, rejectDraft } from "@/app/finance/forms/[formId]/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldError, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { AiDraftBadge, Badge } from "@/components/ui/status-badge";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { cn } from "@/lib/cn";
import { DRAFTABLE_TYPES, TYPE_LABEL, slugKey } from "@/lib/forms/editor/definition";
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

type Decision = "pending" | "accepted" | "discarded";

type Row = { id: number; field: ProposedField; decision: Decision; editing: boolean };

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

export function ImportPanel({ formId, initiallyOpen, onApplied, onClose, onProgress }: { formId: string; initiallyOpen?: boolean; onApplied: (summary: string) => void; onClose: () => void; onProgress?: (reviewed: number, total: number) => void }) {
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
      setRows(result.fields.map(({ id, field }) => ({ id, field, decision: "pending", editing: false })));
    });
  }

  function patchRow(id: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function patchField(id: number, patch: Partial<ProposedField>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, field: { ...row.field, ...patch } } : row)));
  }

  const kept = rows.filter((row) => row.decision === "accepted");
  const reviewed = rows.filter((row) => row.decision !== "pending").length;
  const checks = analysis ? kept.map((row) => ({ row, check: checkField(analysis.paragraphs, row.field) })) : [];
  const blocked = checks.filter(({ check }) => !check.ok).length;
  const left = rows.length - reviewed;

  useEffect(() => {
    onProgress?.(reviewed, rows.length);
  }, [reviewed, rows.length, onProgress]);

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
    <Card className="mb-6 border-[#c9b8ef]" role="region" aria-label="Import a legacy Word template">
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
        <ErrorSummary ref={errorRef} title={problemsTitle(errors.length, "you continue")} items={errors.map((message) => ({ message }))} className="mb-0" />

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
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-dashed border-[#c9b8ef] bg-[#faf8fe] px-4 py-3 text-sm" role="note">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <AiDraftBadge />
                  <span className="text-xs text-muted">
                    {analysis.modeLabel}
                    {analysis.model ? `, ${analysis.model}` : ""}
                  </span>
                </p>
                <p className="mt-1.5 max-w-[72ch] text-ink">Each detected question needs Accept or Discard. Nothing is added to the form until you apply your decisions, and your name is recorded in the audit log.</p>
                <p className="mt-1 font-mono text-xs text-muted">Template fingerprint {analysis.inputSha256.slice(0, 16)}</p>
                {analysis.notices.map((notice) => (
                  <p key={notice} className="mt-2 flex items-start gap-2 text-ink">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                    {notice}
                  </p>
                ))}
              </div>
              <p className="num rounded-full bg-white px-3 py-1 text-sm font-semibold text-ink ring-1 ring-inset ring-line" aria-live="polite">
                {reviewed} of {rows.length} reviewed
              </p>
            </div>

            <ul className="space-y-3">
              {rows.map((row) => {
                const check = checkField(analysis.paragraphs, row.field);
                const library = row.field.library_key ? STANDARD_QUESTIONS.find((q) => q.key === row.field.library_key) : undefined;
                const paragraphText = analysis.paragraphs[row.field.citation.paragraph - 1];
                const discarded = row.decision === "discarded";
                const accepted = row.decision === "accepted";
                return (
                  <li
                    key={row.id}
                    className={cn(
                      "rounded-lg border bg-white",
                      discarded ? "border-line opacity-60" : accepted ? "border-ok/40" : !check.ok ? "border-bad" : "border-dashed border-[#c9b8ef]"
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 basis-72">
                        <p className="flex flex-wrap items-center gap-2">
                          {accepted ? (
                            <Badge tone="ok" icon={CheckCircle2}>Accepted</Badge>
                          ) : discarded ? (
                            <Badge>Discarded</Badge>
                          ) : (
                            <AiDraftBadge />
                          )}
                          <span className={cn("text-sm font-semibold text-ink", discarded && "line-through")}>{row.field.label || "Untitled field"}</span>
                        </p>
                        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                          <div className="flex gap-1.5">
                            <dt className="text-muted">Type</dt>
                            <dd className="font-semibold text-ink">{TYPE_LABEL[row.field.type as FieldType] ?? row.field.type}</dd>
                          </div>
                          <div className="flex gap-1.5">
                            <dt className="text-muted">Key</dt>
                            <dd className="font-mono text-ink">{row.field.library_key ?? slugKey(row.field.label)}</dd>
                          </div>
                          <div className="flex gap-1.5">
                            <dt className="text-muted">Section</dt>
                            <dd className="text-ink">{SECTION_LABEL[row.field.section] ?? row.field.section}</dd>
                          </div>
                          <div className="flex gap-1.5">
                            <dt className="text-muted">Answer</dt>
                            <dd className="text-ink">{row.field.required ? "Required" : "Optional"}</dd>
                          </div>
                        </dl>
                        {library ? (
                          <p className="mt-1.5">
                            <Badge tone="info" icon={BookOpen}>
                              Standard library: {library.label}
                            </Badge>
                          </p>
                        ) : null}
                        {row.field.options?.length ? <p className="mt-1.5 text-xs text-muted">Choices: {row.field.options.join(", ")}</p> : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {row.decision === "pending" ? (
                          <>
                            <Button size="sm" onClick={() => patchRow(row.id, { decision: "accepted", editing: false })} disabled={!check.ok} aria-label={`Accept ${row.field.label}`}>
                              <Check className="h-4 w-4" aria-hidden="true" />
                              Accept
                            </Button>
                            <Button variant="secondary" size="sm" aria-expanded={row.editing} onClick={() => patchRow(row.id, { editing: !row.editing })} aria-label={`${row.editing ? "Close editor for" : "Edit"} ${row.field.label}`}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                              {row.editing ? "Done" : "Edit"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => patchRow(row.id, { decision: "discarded", editing: false })} aria-label={`Discard ${row.field.label}`}>
                              <X className="h-4 w-4" aria-hidden="true" />
                              Discard
                            </Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => patchRow(row.id, { decision: "pending" })} aria-label={`Undo decision for ${row.field.label}`}>
                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                            Undo
                          </Button>
                        )}
                      </div>
                    </div>
                    {!discarded ? (
                      <div className="border-t border-line bg-surface/60 px-4 py-2.5">
                        <p className="text-xs font-semibold text-muted">From template paragraph {row.field.citation.paragraph}</p>
                        <blockquote className="mt-1 border-l-2 border-line-strong pl-3 text-sm italic text-muted">
                          {paragraphText !== undefined ? <Highlighted paragraph={paragraphText} quote={row.field.citation.quote} /> : <span>No such paragraph.</span>}
                        </blockquote>
                        {!check.citationOk ? (
                          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-bad">
                            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                            Citation not found in the template. Edit the quote or discard this question.
                          </p>
                        ) : (
                          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ok">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Quote matches the template
                          </p>
                        )}
                        {check.problems.filter((problem) => problem !== "Citation not found in the template").map((problem) => (
                          <FieldError key={problem}>{problem}</FieldError>
                        ))}
                      </div>
                    ) : null}
                    {row.editing && row.decision === "pending" ? <FieldEditor row={row} onChange={(patch) => patchField(row.id, patch)} /> : null}
                  </li>
                );
              })}
            </ul>

            <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-5 py-3">
              <p className="text-sm text-muted" aria-live="polite">
                {left > 0 ? `${left} still to review. ` : "Everything is reviewed. "}
                <span className="num">{kept.length}</span> accepted.
                {blocked > 0 ? ` ${blocked} accepted ${blocked === 1 ? "question needs" : "questions need"} fixing.` : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={discard} disabled={pending}>
                  Discard draft
                </Button>
                <Button onClick={approve} disabled={pending || left > 0 || blocked > 0 || kept.length === 0}>
                  {pending ? "Applying" : `Add ${kept.length} accepted question${kept.length === 1 ? "" : "s"}`}
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
