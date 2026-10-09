"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, FileUp, Lock, Pencil, Plus, Rocket, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { publishForm, saveDefinition } from "@/app/finance/forms/[formId]/actions";
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
};

const BUDGET = "__budget";

export function FormWorkbench({ formId, version, status, initiativeId, initiativeName, initialDefinition, canEdit, openImport, publishedVersion }: Props) {
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
  const errorRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);

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
    requestAnimationFrame(() => confirmRef.current?.focus());
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
          <button type="button" role="tab" aria-selected={view === "edit"} onClick={() => setView("edit")} className={cn("inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-semibold", view === "edit" ? "bg-navy-800 text-white" : "text-ink hover:bg-navy-50")}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {editable ? "Edit form" : "Structure"}
          </button>
          <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => setView("preview")} className={cn("inline-flex h-8 items-center gap-2 rounded px-3 text-sm font-semibold", view === "preview" ? "bg-navy-800 text-white" : "text-ink hover:bg-navy-50")}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            Preview as organization
          </button>
        </div>
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)} disabled={dirty || importOpen} title={dirty ? "Save your changes before importing" : undefined}>
              <FileUp className="h-4 w-4" aria-hidden="true" />
              Import legacy Word template
            </Button>
            <Button variant="secondary" onClick={() => save()} disabled={pending || !dirty}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {pending ? "Saving" : dirty ? "Save draft" : "Saved"}
            </Button>
            {review && importOpen ? (
              <span className={cn("num rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", reviewing ? "bg-[#f1ecfb] text-[#5b3fa0] ring-[#5b3fa0]/20" : "bg-ok-bg text-ok ring-ok/25")} aria-live="polite">
                {review.reviewed} of {review.total} reviewed
              </span>
            ) : null}
            <Button onClick={openPublish} disabled={pending || dirty || importOpen || confirming} aria-describedby="publish-why" title={dirty ? "Save your changes before publishing" : importOpen ? "Finish the import review first" : undefined}>
              {importOpen ? <Lock className="h-4 w-4" aria-hidden="true" /> : <Rocket className="h-4 w-4" aria-hidden="true" />}
              Publish
            </Button>
            <span id="publish-why" className="sr-only">
              {dirty ? "Save your changes before publishing." : importOpen ? "Review every imported question first." : ""}
            </span>
          </div>
        ) : null}
      </div>

      {confirming ? (
        <div ref={confirmRef} tabIndex={-1} role="region" aria-labelledby="publish-title" className="mb-4 rounded-xl border border-l-4 border-line border-l-navy-800 bg-white px-5 py-4 shadow-card focus:outline-none">
          <h2 id="publish-title" className="text-[15px] font-semibold text-ink">
            Publish version {version}?
          </h2>
          <p className="mt-1 text-sm text-ink">
            Publishing creates version {version}.{publishedVersion ? ` Organizations already reporting keep version ${publishedVersion}.` : " Organizations start using it right away."}
          </p>
          <p className="mt-1 text-sm text-muted">This cannot be undone. The change is recorded in the audit log under your name.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={confirmPublish} disabled={pending}>
              <Rocket className="h-4 w-4" aria-hidden="true" />
              {pending ? "Publishing" : `Publish version ${version}`}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

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
          }}
          onProgress={(reviewed, total) => setReview((current) => (total === 0 ? null : current && current.reviewed === reviewed && current.total === total ? current : { reviewed, total }))}
          onApplied={(summary) => {
            setImportOpen(false);
            setReview(null);
            setNotice(`Draft applied. ${summary}`);
            setErrors([]);
            router.refresh();
          }}
        />
      ) : null}

      {view === "preview" ? (
        <FormPreview definition={definition} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
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
                <CardHeader title="Budget settings" description="How funded organizations report spending in this form." />
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
                  </CardBody>
                </Card>

                {editable ? (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Card>
                      <CardHeader title="Add a question" description="Creates a question for this initiative only." />
                      <CardBody className="space-y-3">
                        <div>
                          <Label htmlFor="new-label">Question label</Label>
                          <Input id="new-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addNew())} />
                        </div>
                        <div>
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
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Add question
                        </Button>
                      </CardBody>
                    </Card>
                    <Card>
                      <CardHeader title="Add from standard library" description="Shared with every initiative. Not copied." />
                      <CardBody className="space-y-3">
                        <div>
                          <Label htmlFor="library">Standard question</Label>
                          <Select id="library" value={libraryKey} onChange={(e) => setLibraryKey(e.target.value)}>
                            <option value="">{available.length ? "Choose a question" : "All standard questions are already in this form"}</option>
                            {available.map((q) => (
                              <option key={q.key} value={q.key}>
                                {q.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <Button variant="secondary" onClick={addLibrary} disabled={!libraryKey}>
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Add from library
                        </Button>
                      </CardBody>
                    </Card>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <aside aria-label="Live preview" className="hidden self-start xl:sticky xl:top-4 xl:block xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Live preview, as organizations see it
            </p>
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
