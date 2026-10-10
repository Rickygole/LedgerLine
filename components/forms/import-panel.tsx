"use client";

import { AlertTriangle, BookOpen, Check, CheckCircle2, FileText, FileUp, Pencil, Undo2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { analyzeTemplate, applyDraft, rejectDraft } from "@/app/finance/forms/[formId]/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/status-badge";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { cn } from "@/lib/cn";
import { DRAFTABLE_TYPES, TYPE_LABEL } from "@/lib/forms/editor/definition";
import { LIBRARY_KEYS, SECTION_KEYS, checkField, type ProposedField } from "@/lib/forms/editor/draft-core";
import { MAX_UPLOAD_BYTES } from "@/lib/forms/editor/limits";
import { STANDARD_QUESTIONS } from "@/lib/forms/standard";
import type { FieldType } from "@/lib/rules/types";
import { formatDate, nowIso } from "@/lib/dates";

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
      <mark className="rounded-sm bg-warn-bg px-0.5 font-semibold text-ink">{collapsedParagraph.slice(at, at + collapsedQuote.length)}</mark>
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
  const [fileName, setFileName] = useState("");
  const [focusId, setFocusId] = useState<number | null>(null);

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

  const focused = rows.find((row) => row.id === focusId) ?? rows.find((row) => row.decision === "pending") ?? null;
  const focusedParagraph = focused ? focused.field.citation.paragraph : null;

  function focusRow(id: number) {
    setFocusId(id);
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    requestAnimationFrame(() => document.getElementById(`${fileId}-p${row.field.citation.paragraph}`)?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  }

  const sourceLine = analysis
    ? analysis.mode === "live"
      ? `Suggestions generated by ${analysis.model ?? "a language model"} from ${fileName || "your document"} on ${formatDate(nowIso())}. Review each one; you are responsible for the final form.`
      : analysis.mode === "replay"
        ? `Showing saved suggestions for ${fileName || "this document"}, built from the rules and a reviewed earlier result. No model was used. Review each one; you are responsible for the final form.`
        : `Suggested from the headings and labels in ${fileName || "your document"} using the rules. No model was used. Review each one; you are responsible for the final form.`
    : "";

  return (
    <section className="mb-6 rounded border border-line bg-white" aria-labelledby={`${fileId}-title`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
        <div className="min-w-0">
          <h2 id={`${fileId}-title`} className="text-xl font-bold leading-7 text-ink">
            Import from Word
          </h2>
          <p className="mt-0.5 max-w-[70ch] text-[15px] leading-[22px] text-ink-2">We read the document and suggest questions. Nothing is added to the form until you accept it.</p>
        </div>
        <Button variant="ghost" size="sm" className="px-0" onClick={analysis ? discard : onClose} disabled={pending}>
          Cancel import
        </Button>
      </div>
      <div className="space-y-5 px-5 py-5 sm:px-6">
        <ErrorSummary ref={errorRef} title={problemsTitle(errors.length, "you continue")} items={errors.map((message) => ({ message }))} className="mb-0" />

        {!analysis ? (
          <form action={upload} className="space-y-4">
            <label htmlFor={fileId} className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-line-strong bg-harbor-50/50 px-4 py-6 text-center hover:border-action">
              <FileUp className="h-6 w-6 text-ink-2" aria-hidden="true" />
              <span className="text-[17px] font-bold text-ink">Upload a Word template (.docx)</span>
              <span className="text-[15px] text-ink-2">{fileName ? `Selected: ${fileName}` : "Choose a file or drag it here. Up to 2 MB."}</span>
              <input
                id={fileId}
                ref={fileRef}
                name="template"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                autoFocus={initiallyOpen}
                onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? "")}
              />
            </label>
            <Button type="submit" disabled={pending} className="h-11 px-5 text-base">
              {pending ? "Reading the document" : "Suggest questions"}
            </Button>
          </form>
        ) : (
          <>
            {analysis.notices.map((notice) => (
              <p key={notice} className="flex items-start gap-2 text-[15px] text-ink">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
                {notice}
              </p>
            ))}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <h3 className="text-[17px] font-bold leading-6 text-ink">From your document</h3>
                <p className="mt-0.5 font-mono text-[13px] text-muted">Fingerprint {analysis.inputSha256.slice(0, 16)}</p>
                <ol className="mt-3 max-h-[36rem] space-y-2 overflow-y-auto rounded border border-line bg-white p-4 text-[15px] leading-6 text-ink lg:sticky lg:top-6">
                  {analysis.paragraphs.map((paragraph, index) => {
                    const number = index + 1;
                    const active = focusedParagraph === number;
                    return (
                      <li key={number} id={`${fileId}-p${number}`} className={cn("scroll-my-4 rounded px-2 py-1", active && "bg-harbor-50 ring-1 ring-inset ring-harbor-200")}>
                        <span className="num mr-2 select-none text-[13px] text-muted">{number}</span>
                        {active && focused ? <Highlighted paragraph={paragraph} quote={focused.field.citation.quote} /> : paragraph}
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[17px] font-bold leading-6 text-ink">Suggested questions ({rows.length})</h3>
                  <p className="num text-[15px] font-semibold text-ink" aria-live="polite">
                    {reviewed} of {rows.length} reviewed
                  </p>
                </div>
                <span aria-hidden="true" className="mt-2 block h-2 overflow-hidden rounded-sm bg-harbor-100">
                  <span className="block h-full bg-ok" style={{ width: `${rows.length ? Math.round((reviewed / rows.length) * 100) : 0}%` }} />
                </span>
                <ul className="mt-4 space-y-3">
                  {rows.map((row) => {
                    const check = checkField(analysis.paragraphs, row.field);
                    const library = row.field.library_key ? STANDARD_QUESTIONS.find((q) => q.key === row.field.library_key) : undefined;
                    const discarded = row.decision === "discarded";
                    const accepted = row.decision === "accepted";
                    const typeLabel = TYPE_LABEL[row.field.type as FieldType] ?? row.field.type;
                    if (accepted || discarded) {
                      return (
                        <li key={row.id} className={cn("flex items-center justify-between gap-3 rounded border px-4 py-2.5", accepted ? "border-ok/40 bg-ok-bg/40" : "border-line bg-surface")}>
                          <p className="flex min-w-0 items-center gap-2 text-[15px]">
                            {accepted ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
                            <span className={cn("truncate", discarded && "text-muted line-through")}>{row.field.label || "Untitled question"}</span>
                            <span className="sr-only">{accepted ? ", accepted" : ", discarded"}</span>
                          </p>
                          <Button variant="ghost" size="sm" className="px-0" onClick={() => patchRow(row.id, { decision: "pending" })} aria-label={`Undo decision for ${row.field.label}`}>
                            <Undo2 className="h-4 w-4" aria-hidden="true" />
                            Undo
                          </Button>
                        </li>
                      );
                    }
                    return (
                      <li
                        key={row.id}
                        onFocusCapture={() => focusRow(row.id)}
                        onMouseEnter={() => focusRow(row.id)}
                        className={cn("rounded border bg-white", !check.ok ? "border-bad" : focused?.id === row.id ? "border-harbor-600 ring-2 ring-harbor-600/15" : "border-line")}
                      >
                        <div className="px-4 py-3">
                          <p className="flex flex-wrap items-center gap-2">
                            <Badge tone="info" icon={FileText}>
                              Suggested
                            </Badge>
                            <span className="text-[15px] font-bold text-ink">{row.field.label || "Untitled question"}</span>
                          </p>
                          <p className="mt-1.5 text-sm text-ink-2">
                            {[row.field.type === "textarea" && row.field.max_words ? `${typeLabel}, up to ${row.field.max_words} words` : typeLabel, row.field.section_title || SECTION_LABEL[row.field.section] || row.field.section, row.field.required ? "Required" : "Optional"].join(" · ")}
                          </p>
                          {library ? (
                            <p className="mt-1.5">
                              <Badge tone="info" icon={BookOpen}>
                                Standard library: {library.label}
                              </Badge>
                            </p>
                          ) : null}
                          {row.field.options?.length ? <p className="mt-1.5 text-sm text-muted">Choices: {row.field.options.join(", ")}</p> : null}
                          {row.field.type === "table" && row.field.columns?.length ? (
                            <p className="mt-1.5 text-sm text-muted">Columns: {row.field.columns.map((column) => `${column.label} (${TYPE_LABEL[column.type as FieldType] ?? column.type})`).join(", ")}</p>
                          ) : null}
                          <p className="mt-1.5 text-[13px] text-muted">
                            From paragraph {row.field.citation.paragraph}
                            {check.citationOk ? ", quote matches the document" : ""}
                          </p>
                          {!check.citationOk ? (
                            <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-bad">
                              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                              Citation not found in the document. Edit the quote or discard this question.
                            </p>
                          ) : null}
                          {check.problems.filter((problem) => problem !== "Citation not found in the template").map((problem) => (
                            <FieldError key={problem}>{problem}</FieldError>
                          ))}
                          <div className="mt-3 flex flex-wrap items-center gap-4">
                            <Button variant="secondary" size="sm" onClick={() => patchRow(row.id, { decision: "accepted", editing: false })} disabled={!check.ok} aria-label={`Accept ${row.field.label}`}>
                              <Check className="h-4 w-4" aria-hidden="true" />
                              Accept
                            </Button>
                            <Button variant="ghost" size="sm" className="px-0" aria-expanded={row.editing} onClick={() => patchRow(row.id, { editing: !row.editing })} aria-label={`${row.editing ? "Close editor for" : "Edit"} ${row.field.label}`}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                              {row.editing ? "Done editing" : "Edit"}
                            </Button>
                            <Button variant="ghost" size="sm" className="px-0" onClick={() => patchRow(row.id, { decision: "discarded", editing: false })} aria-label={`Discard ${row.field.label}`}>
                              <X className="h-4 w-4" aria-hidden="true" />
                              Discard
                            </Button>
                          </div>
                        </div>
                        {row.editing ? <FieldEditor row={row} onChange={(patch) => patchField(row.id, patch)} /> : null}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-[13px] leading-5 text-muted">{sourceLine}</p>
              </div>
            </div>

            <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-5 py-3 sm:-mx-6 sm:px-6">
              <p className="text-[15px] text-ink-2" aria-live="polite">
                <span className="num">{kept.length}</span> accepted{left > 0 ? `, ${left} not reviewed yet (they will not be added)` : ""}.
                {blocked > 0 ? ` ${blocked} accepted ${blocked === 1 ? "question needs" : "questions need"} fixing.` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Button variant="ghost" className="px-0" onClick={discard} disabled={pending}>
                  Cancel import
                </Button>
                <Button onClick={approve} disabled={pending || blocked > 0 || kept.length === 0} className="h-11 px-5 text-base">
                  {pending ? "Adding" : `Add ${kept.length} accepted question${kept.length === 1 ? "" : "s"} to draft`}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
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
          {(field.type === "table" ? [...DRAFTABLE_TYPES, "table" as const] : DRAFTABLE_TYPES).map((type) => (
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
