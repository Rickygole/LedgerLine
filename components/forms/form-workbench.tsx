"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, FileUp, Lock, Pencil, Plus, Rocket, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { publishForm, saveDefinition } from "@/app/finance/forms/[formId]/actions";
import { FormPreview } from "@/components/forms/form-preview";
import { ImportPanel } from "@/components/forms/import-panel";
import { QuestionEditor } from "@/components/forms/question-editor";
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
};

const BUDGET = "__budget";

export function FormWorkbench({ formId, version, status, initiativeId, initiativeName, initialDefinition, canEdit, openImport }: Props) {
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

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
    dialogRef.current?.showModal();
  }

  function confirmPublish() {
    startTransition(async () => {
      const result = await publishForm(formId);
      dialogRef.current?.close();
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
            Preview as CBO
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
            <Button onClick={openPublish} disabled={pending || dirty} title={dirty ? "Save your changes before publishing" : undefined}>
              <Rocket className="h-4 w-4" aria-hidden="true" />
              Publish
            </Button>
          </div>
        ) : null}
      </div>

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

      {errors.length > 0 ? (
        <div ref={errorRef} tabIndex={-1} role="alert" className="mb-4 rounded-md border border-bad/30 bg-bad-bg px-4 py-3 text-sm text-bad focus:outline-none focus:ring-2 focus:ring-bad/30">
          <p className="font-semibold">{errors.length === 1 ? "There is a problem." : "There are problems to fix."}</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
          onClose={() => setImportOpen(false)}
          onApplied={(summary) => {
            setImportOpen(false);
            setNotice(`Draft applied. ${summary}`);
            setErrors([]);
            router.refresh();
          }}
        />
      ) : null}

      {view === "preview" ? (
        <FormPreview definition={definition} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <nav aria-label="Sections" className="self-start">
            <Card>
              <CardHeader title="Sections" />
              <ul className="p-2">
                {definition.sections.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      aria-current={sectionKey === s.key ? "true" : undefined}
                      onClick={() => setSectionKey(s.key)}
                      className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", sectionKey === s.key ? "bg-navy-50 font-semibold text-navy-900" : "text-ink hover:bg-surface")}
                    >
                      <span>{s.title}</span>
                      <span className="num text-xs text-muted">{s.kind === "budget" ? (definition.budget.enabled ? "On" : "Off") : s.questions.length}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </nav>

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
        </div>
      )}

      <dialog ref={dialogRef} aria-labelledby="publish-title" className="m-auto w-full max-w-md rounded-lg border border-line p-0 shadow-xl backdrop:bg-ink/40">
        <div className="p-6">
          <h2 id="publish-title" className="text-lg font-semibold text-ink">
            Publish version {version}?
          </h2>
          <p className="mt-2 text-sm text-ink">New reports use v{version}. Reports already started keep their version.</p>
          <p className="mt-2 text-sm text-muted">The current published version becomes superseded. This cannot be undone, and the change is recorded in the audit log.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => dialogRef.current?.close()} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={confirmPublish} disabled={pending}>
              {pending ? "Publishing" : `Publish version ${version}`}
            </Button>
          </div>
        </div>
      </dialog>
      <p className="mt-6 text-sm text-muted">
        <Link href={`/finance/initiatives/${initiativeId}`} className="text-navy-800 hover:underline">
          Back to {initiativeName}
        </Link>
      </p>
    </div>
  );
}
