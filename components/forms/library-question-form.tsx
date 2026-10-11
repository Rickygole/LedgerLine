"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveLibraryQuestion } from "@/app/finance/question-library/actions";
import { TableSettings } from "@/components/forms/table-settings";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { FIELD_TYPES, TYPE_LABEL, defaultTable, questionProblems, slugKey } from "@/lib/forms/editor/definition";
import { TEMPLATE_SECTIONS, type TemplateSection } from "@/lib/forms/standard";
import type { FieldType, Question } from "@/lib/rules/types";

type Props = {
  mode: "create" | "update";
  initial: Question | null;
  initialSection: TemplateSection | null;
  canEdit: boolean;
  locked?: boolean;
};

const BLANK: Question = { key: "", label: "", type: "text", required: false, scope: "standard", maxLength: 160 };

export function LibraryQuestionForm({ mode, initial, initialSection, canEdit, locked = false }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState<Question>(initial ?? BLANK);
  const [keyTouched, setKeyTouched] = useState(false);
  const [section, setSection] = useState<TemplateSection | "">(initialSection ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const errorRef = useRef<HTMLDivElement>(null);
  const editable = canEdit && !locked;
  const protectedType = initial !== null && (initial.key === "org_legal_name" || initial.key === "org_ein");

  function patch(change: Partial<Question>) {
    setQuestion((current) => ({ ...current, ...change }));
    setNotice(null);
  }

  function changeType(type: FieldType) {
    const change: Partial<Question> = { type };
    change.options =
      type === "select" ? (question.options?.length ? question.options : ["Option 1", "Option 2"]) : undefined;
    change.maxWords = type === "textarea" ? (question.maxWords ?? 300) : undefined;
    change.maxLength = type === "text" ? (question.maxLength ?? 160) : undefined;
    if (type === "table") {
      const table = defaultTable();
      change.columns = question.columns?.length ? question.columns : table.columns;
      change.maxRows = question.maxRows ?? table.maxRows;
    } else {
      change.columns = undefined;
      change.maxRows = undefined;
      change.sumRule = undefined;
    }
    patch(change);
  }

  function show(list: string[]) {
    setErrors(list);
    setNotice(null);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  function save() {
    const finished: Question = { ...question, key: question.key.trim(), label: question.label.trim() };
    const problems: string[] = [];
    if (!finished.label) problems.push("Enter the question label.");
    if (!/^[a-z][a-z0-9_]{1,59}$/.test(finished.key))
      problems.push("The key must start with a letter and use only lowercase letters, numbers and underscores.");
    problems.push(...questionProblems(finished));
    if (problems.length > 0) return show(problems);
    startTransition(async () => {
      const result = await saveLibraryQuestion(mode, {
        question: finished,
        templateSection: section === "" ? null : section,
      });
      if (!result.ok) return show(result.errors);
      setErrors([]);
      if (mode === "create") {
        router.push(`/finance/question-library/${result.key}?added=1`);
        return;
      }
      setNotice("Question saved. Forms that already use it are not changed until you apply it to them.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title={mode === "create" ? "New library question" : "Question details"}
        description="Library questions are shared by reference with every initiative. Forms that are already published keep their own copy until you apply a change to them."
      />
      <CardBody>
        <ErrorSummary
          ref={errorRef}
          title={problemsTitle(errors.length, "you save")}
          items={errors.map((message) => ({ message }))}
        />
        {notice ? (
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ok" role="status">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {notice}
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="lib-label">Label</Label>
            <Input
              id="lib-label"
              value={question.label}
              disabled={!editable}
              maxLength={200}
              onChange={(e) => {
                patch({
                  label: e.target.value,
                  ...(mode === "create" && !keyTouched ? { key: slugKey(e.target.value) } : {}),
                });
              }}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lib-key">Key</Label>
            <Hint>Used in exports and stored with every answer. It cannot be changed after the question is added.</Hint>
            <Input
              id="lib-key"
              className="font-mono"
              value={question.key}
              disabled={!editable || mode === "update"}
              maxLength={60}
              onChange={(e) => {
                setKeyTouched(true);
                patch({ key: e.target.value });
              }}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="lib-help" optional>
              Help text
            </Label>
            <Textarea
              id="lib-help"
              className="min-h-16"
              value={question.help ?? ""}
              disabled={!editable}
              onChange={(e) => patch({ help: e.target.value || undefined })}
            />
          </div>
          <div>
            <Label htmlFor="lib-type">Answer type</Label>
            <Select
              id="lib-type"
              value={question.type}
              disabled={!editable || protectedType}
              onChange={(e) => changeType(e.target.value as FieldType)}
            >
              {FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2.5 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-line"
                checked={question.required}
                disabled={!editable}
                onChange={(e) => patch({ required: e.target.checked })}
              />
              Required
            </label>
          </div>
          {question.type === "select" ? (
            <div className="sm:col-span-2">
              <Label htmlFor="lib-options">Choices</Label>
              <Hint>One choice per line. At least two.</Hint>
              <Textarea
                id="lib-options"
                className="min-h-24"
                value={(question.options ?? []).join("\n")}
                disabled={!editable}
                onChange={(e) => patch({ options: e.target.value.split("\n") })}
              />
            </div>
          ) : null}
          {question.type === "textarea" ? (
            <div>
              <Label htmlFor="lib-words">Maximum words</Label>
              <Input
                id="lib-words"
                type="number"
                min={1}
                className="num"
                value={question.maxWords ?? ""}
                disabled={!editable}
                onChange={(e) => patch({ maxWords: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          ) : null}
          {question.type === "text" ? (
            <div>
              <Label htmlFor="lib-length">Maximum characters</Label>
              <Input
                id="lib-length"
                type="number"
                min={1}
                className="num"
                value={question.maxLength ?? ""}
                disabled={!editable}
                onChange={(e) => patch({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
          ) : null}
          {question.type === "table" ? (
            <TableSettings question={question} disabled={!editable} onChange={patch} />
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="lib-section">Starts in new forms</Label>
            <Hint>
              Choose a section to include this question in every new form. Leave it out to offer the question only
              through Add from library in the form editor.
            </Hint>
            <Select
              id="lib-section"
              value={section}
              disabled={!editable}
              onChange={(e) => setSection(e.target.value as TemplateSection | "")}
            >
              <option value="">Not included in new forms</option>
              {TEMPLATE_SECTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.title}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {editable ? (
          <div className="mt-6 flex items-center gap-3">
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving" : mode === "create" ? "Add to library" : "Save question"}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
