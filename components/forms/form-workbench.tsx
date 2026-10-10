"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { publishForm, saveDefinition } from "@/app/finance/forms/[formId]/actions";
import { counted } from "@/lib/format";
import { FormPreview } from "@/components/forms/form-preview";
import { ImportPanel } from "@/components/forms/import-panel";
import { QuestionEditor } from "@/components/forms/question-editor";
import { QuestionOutline } from "@/components/forms/question-outline";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { FIELD_TYPES, TYPE_LABEL, addQuestion, cleanDefinition, moveQuestion, newQuestion, removeQuestion, updateQuestion, validateDefinition } from "@/lib/forms/editor/definition";
import { STANDARD_QUESTIONS } from "@/lib/forms/standard";
import type { FieldType, FormDefinition, Question } from "@/lib/rules/types";

type Props = {
  formId: string;
  version: number;
  status: "draft" | "published" | "superseded";
  initiativeId: string;
  initiativeName: string;
  initialDefinition: FormDefinition;
  canEdit: boolean;
  openImport: boolean;
  publishedVersion: number | null;
  publishedDefinition: FormDefinition | null;
};

function changesSince(before: FormDefinition | null, after: FormDefinition) {
  const list = (d: FormDefinition | null) => new Map((d?.sections ?? []).flatMap((s) => s.questions.map((q) => [q.key, JSON.stringify(q)] as const)));
  const old = list(before);
  const now = list(after);
  let added = 0;
  let changed = 0;
  let removed = 0;
  for (const [key, value] of now) {
    if (!old.has(key)) added += 1;
    else if (old.get(key) !== value) changed += 1;
  }
  for (const key of old.keys()) if (!now.has(key)) removed += 1;
  const budget = before !== null && JSON.stringify(before.budget) !== JSON.stringify(after.budget);
  return { added, changed, removed, budget, total: [...now.keys()].length };
}

const BUDGET = "__budget";

export function FormWorkbench({ formId, version, status, initiativeId, initiativeName, initialDefinition, canEdit, openImport, publishedVersion, publishedDefinition }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState<FormDefinition>(initialDefinition);
  const [definition, setDefinition] = useState<FormDefinition>(initialDefinition);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [sectionKey, setSectionKey] = useState<string>(initialDefinition.sections.find((s) => s.kind === "questions")?.key ?? BUDGET);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(openImport && canEdit);
  const [published, setPublished] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");
  const [libraryKey, setLibraryKey] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [review, setReview] = useState<{ reviewed: number; total: number } | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);

  const editable = canEdit && status === "draft";
  const dirty = useMemo(() => JSON.stringify(cleanDefinition(definition)) !== JSON.stringify(cleanDefinition(saved)), [definition, saved]);
  const section = definition.sections.find((s) => s.key === sectionKey);
  const used = new Set(definition.sections.flatMap((s) => s.questions.map((q) => q.key)));
  const available = STANDARD_QUESTIONS.filter((q) => !used.has(q.key));

  useEffect(() => {
    setSaved(initialDefinition);
    setDefinition(initialDefinition);
  }, [initialDefinition]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function showErrors(list: string[]) {
    setErrors(list);
    setNotice(null);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function save(after?: () => void) {
    const problems = validateDefinition(definition);
    if (problems.length > 0) return showErrors(problems);
    startTransition(async () => {
      const result = await saveDefinition(formId, cleanDefinition(definition));
      if (!result.ok) return showErrors(result.errors);
      setSaved(cleanDefinition(definition));
      setErrors([]);
      setNotice("Draft saved.");
      router.refresh();
      after?.();
    });
  }

  function openPublish() {
    const problems = validateDefinition(definition);
    if (problems.length > 0) return showErrors(problems);
    setErrors([]);
    setConfirming(true);
    confirmRef.current?.showModal();
  }

  function reorder(key: string, from: number, to: number) {
    let next = definition;
    const step = to > from ? 1 : -1;
    for (let at = from; at !== to; at += step) next = moveQuestion(next, key, at, step as 1 | -1);
    setDefinition(next);
  }

  const reviewing = importOpen && review !== null && review.reviewed < review.total;

  function confirmPublish() {
    startTransition(async () => {
      const result = await publishForm(formId);
      confirmRef.current?.close();
      setConfirming(false);
      if (!result.ok) return showErrors(result.errors);
      setPublished(result.version);
      setErrors([]);
      router.refresh();
    });
  }

  function addNew() {
    if (!newLabel.trim() || !section || section.kind !== "questions") return;
    const question = newQuestion(definition, newLabel, newType);
    setDefinition(addQuestion(definition, section.key, question));
    setNewLabel("");
    setNewType("text");
    setNotice(null);
  }

  function addLibrary() {
    const standard = STANDARD_QUESTIONS.find((q) => q.key === libraryKey);
    if (!standard || !section || section.kind !== "questions") return;
    setDefinition(addQuestion(definition, section.key, JSON.parse(JSON.stringify(standard)) as Question));
    setLibraryKey("");
    setNotice(null);
  }

  if (published !== null) {
    return (
      <Card>
        <CardBody className="flex flex-col items-start gap-4">
          <p className="flex items-center gap-2 text-base font-semibold text-ok" role="status">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            Version {published} is published.
          </p>
          <p className="text-sm text-ink">New reports for {initiativeName} use version {published}. Reports already started keep their version. The change is recorded in the audit log.</p>
          <div className="flex gap-2">
            <ButtonLink href={`/finance/initiatives/${initiativeId}`}>Back to the initiative</ButtonLink>
            <ButtonLink variant="secondary" href={`/finance/forms/${formId}`} onClick={() => setPublished(null)}>
              View this version
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Form view" className="inline-flex rounded-md border border-line bg-white p-0.5 shadow-sm">
          <button type="button" role="tab" aria-selected={view === "edit"} onClick={() => setView("edit")} className={cn("inline-flex h-8 items-center rounded px-3 text-sm font-semibold", view === "edit" ? "bg-harbor-800 text-white" : "text-ink hover:bg-harbor-50")}>
            {editable ? "Edit form" : "Structure"}
          </button>
          <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => setView("preview")} className={cn("inline-flex h-8 items-center rounded px-3 text-sm font-semibold", view === "preview" ? "bg-harbor-800 text-white" : "text-ink hover:bg-harbor-50")}>
            Preview as organization
          </button>
        </div>
        {editable ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {dirty || pending ? (
              <Button variant="secondary" onClick={() => save()} disabled={pending}>
                {pending ? "Saving" : "Save draft"}
              </Button>
            ) : (
              <span role="status" className="text-sm text-muted">
                Saved
              </span>
            )}
            {importOpen ? null : (
              <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={dirty} title={dirty ? "Save your changes before importing" : undefined}>
                Import from Word
              </Button>
            )}
            {review && importOpen ? (
              <span className={cn("num rounded-sm px-2.5 py-1 text-[13px] font-semibold ring-1 ring-inset", reviewing ? "bg-harbor-100 text-harbor-700 ring-harbor-700/20" : "bg-ok-bg text-ok ring-ok/25")} aria-live="polite">
                {review.reviewed} of {review.total} reviewed
              </span>
            ) : null}
            <Button onClick={openPublish} disabled={pending || dirty || importOpen || confirming} aria-describedby="publish-why" title={dirty ? "Save your changes before publishing" : importOpen ? "Finish the import review first" : undefined}>
              Publish version {version}
            </Button>
            <span id="publish-why" className="sr-only">
              {dirty ? "Save your changes before publishing." : importOpen ? "Review every imported question first." : ""}
            </span>
          </div>
        ) : null}
      </div>

      <dialog
        ref={confirmRef}
        aria-labelledby="publish-title"
        onClose={() => setConfirming(false)}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] max-w-none rounded border border-line bg-white p-0 text-ink shadow-[0_4px_16px_rgba(10,26,48,0.16)] backdrop:bg-[#0a1a30]/50"
      >
        <div className="px-6 pb-2 pt-5">
          <h2 id="publish-title" className="text-xl font-bold leading-7">
            Publish version {version}?
          </h2>
          {(() => {
            const diff = changesSince(publishedDefinition, definition);
            const parts = publishedDefinition
              ? [diff.added ? `${counted(diff.added, "question")} added` : null, diff.changed ? `${diff.changed} changed` : null, diff.removed ? `${diff.removed} removed` : null, diff.budget ? "budget settings changed" : null].filter(Boolean)
              : [];
            return (
              <p className="mt-2 text-[15px] leading-[22px]">
                {publishedVersion ? `Changes since version ${publishedVersion}: ${parts.length ? parts.join(", ") : "no question changes"}.` : `This is the first version, with ${counted(diff.total, "question")}.`}
              </p>
            );
          })()}
          <p className="mt-2 text-[15px] leading-[22px] text-ink-2">
            {publishedVersion ? `New reports use version ${version}. Organizations already reporting keep version ${publishedVersion}.` : "Funded organizations start using it right away."}
          </p>
          <p className="mt-2 text-sm text-muted">Published versions cannot be changed. The change is recorded in the audit log under your name.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-line-soft px-6 py-4">
          <Button onClick={confirmPublish} disabled={pending} className="h-11 px-5 text-base">
            {pending ? "Publishing" : `Yes, publish version ${version}`}
          </Button>
          <Button variant="ghost" className="px-0" onClick={() => confirmRef.current?.close()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </dialog>

      {status !== "draft" ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink" role="note">
          <Lock className="h-4 w-4 text-muted" aria-hidden="true" />
          Published versions cannot change. Create a draft to edit.
        </div>
      ) : !canEdit ? (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink" role="note">
          <Lock className="h-4 w-4 text-muted" aria-hidden="true" />
          Only finance administrators can edit or publish a draft. You can review it here.
        </div>
      ) : null}

      <ErrorSummary ref={errorRef} title={problemsTitle(errors.length, "you save or publish")} items={errors.map((message) => ({ message }))} className="mb-4" />
      {notice ? (
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ok" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      {importOpen && editable ? (
        <ImportPanel
          formId={formId}
          initiallyOpen={openImport}
          onClose={() => {
            setImportOpen(false);
            setReview(null);
            setShowBuilder(false);
          }}
          onProgress={(reviewed, total) => setReview((current) => (total === 0 ? null : current && current.reviewed === reviewed && current.total === total ? current : { reviewed, total }))}
          onApplied={(summary) => {
            setImportOpen(false);
            setShowBuilder(false);
            setReview(null);
            setNotice(`Draft applied. ${summary}`);
            setErrors([]);
            router.refresh();
          }}
        />
      ) : null}

      {view === "edit" && importOpen && editable && !showBuilder ? (
        <p className="rounded border border-line bg-white px-5 py-4 text-[15px] text-ink-2">
          Current form:{" "}
          {definition.sections
            .filter((s) => s.kind === "questions")
            .map((s, i) => `${i === 0 ? counted(s.questions.length, "question") : s.questions.length} in ${s.title}`)
            .join(", ")}
          .{" "}
          <button type="button" onClick={() => setShowBuilder(true)} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
            Show
          </button>
        </p>
      ) : view === "preview" ? (
        <FormPreview definition={definition} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
          <div className="self-start lg:sticky lg:top-4">
            <QuestionOutline
              definition={definition}
              sectionKey={sectionKey}
              selectedKey={selectedKey}
              budgetKey={BUDGET}
              canReorder={editable}
              onSection={(key) => {
                setSectionKey(key);
                setSelectedKey(null);
              }}
              onSelect={(key, questionKey) => {
                setSectionKey(key);
                setSelectedKey(questionKey);
              }}
              onReorder={reorder}
            />
          </div>

          <div className="min-w-0 space-y-4">
            {section?.kind === "budget" ? (
              <Card>
                <CardHeader title="Budget settings" />
                <CardBody className="space-y-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <input type="checkbox" className="h-4 w-4 rounded border-line" checked={definition.budget.enabled} disabled={!editable} onChange={(e) => setDefinition({ ...definition, budget: { ...definition.budget, enabled: e.target.checked } })} />
                    Collect a budget with this report
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <input type="checkbox" className="h-4 w-4 rounded border-line" checked={definition.budget.mustEqualAward} disabled={!editable || !definition.budget.enabled} onChange={(e) => setDefinition({ ...definition, budget: { ...definition.budget, mustEqualAward: e.target.checked } })} />
                    Budget total must equal the award
                  </label>
                  <div className="max-w-48">
                    <Label htmlFor="max-lines">Maximum budget lines</Label>
                    <Input id="max-lines" type="number" min={1} max={100} className="num" value={definition.budget.maxLines} disabled={!editable || !definition.budget.enabled} onChange={(e) => setDefinition({ ...definition, budget: { ...definition.budget, maxLines: Number(e.target.value) } })} />
                  </div>
                </CardBody>
              </Card>
            ) : section ? (
              <>
                <Card>
                  <CardHeader title={section.title} description={section.description} />
                  <CardBody>
                    {section.questions.length === 0 ? (
                      <p className="text-sm text-muted">No questions in this section yet.{editable ? " Add one below or from the standard library." : ""}</p>
                    ) : (
                      <ol className="space-y-3">
                        {section.questions.map((question, index) => (
                          <QuestionEditor
                            key={question.key}
                            question={question}
                            index={index}
                            count={section.questions.length}
                            definition={definition}
                            readOnly={!editable}
                            problems={[]}
                            onChange={(patch) => setDefinition(updateQuestion(definition, question.key, patch))}
                            onMove={(direction) => setDefinition(moveQuestion(definition, section.key, index, direction))}
                            onRemove={() => setDefinition(removeQuestion(definition, question.key))}
                            selected={selectedKey === question.key}
                          />
                        ))}
                      </ol>
                    )}
                    {editable ? (
                      <div className="mt-5 grid gap-x-8 gap-y-4 border-t border-line-soft pt-5 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-48 flex-1">
                            <Label htmlFor="new-label">Question label</Label>
                            <Input id="new-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNew())} />
                          </div>
                          <div className="w-40">
                            <Label htmlFor="new-type">Answer type</Label>
                            <Select id="new-type" value={newType} onChange={(e) => setNewType(e.target.value as FieldType)}>
                              {FIELD_TYPES.filter((type) => type !== "table").map((type) => (
                                <option key={type} value={type}>
                                  {TYPE_LABEL[type]}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <Button variant="secondary" onClick={addNew} disabled={!newLabel.trim()}>
                            Add question
                          </Button>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-48 flex-1">
                            <Label htmlFor="library">Standard question</Label>
                            <Select id="library" value={libraryKey} onChange={(e) => setLibraryKey(e.target.value)}>
                              <option value="">{available.length ? "Choose a question" : "All standard questions are in this form"}</option>
                              {available.map((q) => (
                                <option key={q.key} value={q.key}>
                                  {q.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                          <Button variant="secondary" onClick={addLibrary} disabled={!libraryKey}>
                            Add from library
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardBody>
                </Card>

              </>
            ) : null}
          </div>

          <aside aria-label="Live preview" className="hidden self-start xl:sticky xl:top-4 xl:block xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
            <p className="mb-2 text-[13px] font-semibold text-muted">Live preview</p>
            <FormPreview definition={definition} only={definition.sections.find((s) => (s.kind === "budget" ? BUDGET : s.key) === sectionKey)?.key} />
          </aside>
        </div>
      )}

      <p className="mt-6 text-sm text-muted">
        <Link href={`/finance/initiatives/${initiativeId}`} className="text-link underline underline-offset-2 hover:text-link-hover">
          Back to {initiativeName}
        </Link>
      </p>
    </div>
  );
}
