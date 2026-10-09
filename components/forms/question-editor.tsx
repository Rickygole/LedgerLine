"use client";

import { ArrowDown, ArrowUp, BookOpen, ChevronDown, ChevronUp, Quote, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { FIELD_TYPES, TYPE_LABEL, earlierYesNo } from "@/lib/forms/editor/definition";
import type { FieldType, FormDefinition, Question } from "@/lib/rules/types";

type Props = {
  question: Question;
  index: number;
  count: number;
  definition: FormDefinition;
  readOnly: boolean;
  problems: string[];
  onChange: (patch: Partial<Question>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  selected?: boolean;
};

export function QuestionEditor({ question, index, count, definition, readOnly, problems, onChange, onMove, onRemove, selected }: Props) {
  const [open, setOpen] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!selected) return;
    setOpen(true);
    itemRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const id = useId();
  const shared = question.scope === "standard";
  const editable = !readOnly && !shared;
  const earlier = earlierYesNo(definition, question.key);
  const errorId = `${id}-errors`;

  function changeType(type: FieldType) {
    const patch: Partial<Question> = { type };
    if (type === "select" && !question.options?.length) patch.options = ["Option 1", "Option 2"];
    if (type !== "select") patch.options = undefined;
    if (type !== "textarea") patch.maxWords = undefined;
    else patch.maxWords = question.maxWords ?? 300;
    if (type !== "text") patch.maxLength = undefined;
    onChange(patch);
  }

  return (
    <li ref={itemRef} id={`question-${question.key}`} className={`scroll-mt-4 rounded-lg border bg-white ${problems.length ? "border-bad" : selected ? "border-navy-600 ring-2 ring-navy-600/15" : "border-line"}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="num mt-0.5 w-6 shrink-0 text-right text-sm text-muted">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{question.label || "Untitled question"}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge>{TYPE_LABEL[question.type]}</Badge>
            <span className="font-mono text-xs text-muted">{question.key}</span>
            <Badge tone={question.required ? "info" : "neutral"}>{question.required ? "Required" : "Optional"}</Badge>
            {shared ? (
              <Badge tone="info" icon={BookOpen}>
                Standard library
              </Badge>
            ) : null}
            {question.citation ? (
              <Badge icon={Quote}>
                From template paragraph {question.citation.paragraph}
              </Badge>
            ) : null}
            {question.visibleWhen ? <Badge>Conditional</Badge> : null}
          </div>
          {question.citation ? <p className="mt-1.5 text-xs italic text-muted">&ldquo;{question.citation.quote}&rdquo;</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!readOnly ? (
            <>
              <Button variant="ghost" size="sm" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => onMove(-1)}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`Move question ${index + 1} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`Remove question ${index + 1}`} onClick={onRemove}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </>
          ) : null}
          <Button variant="secondary" size="sm" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)}>
            {editable ? "Edit" : "Details"}
            {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </div>
      {problems.length > 0 ? (
        <div id={errorId} className="px-4 pb-3">
          {problems.map((problem) => (
            <FieldError key={problem}>{problem}</FieldError>
          ))}
        </div>
      ) : null}
      {open ? (
        <div id={`${id}-body`} className="grid gap-4 border-t border-line bg-surface/50 px-4 py-4 sm:grid-cols-2">
          {shared ? (
            <p className="text-sm text-muted sm:col-span-2">
              This is a standard library question. It is shared by reference with every initiative, so it can be moved or removed here but not reworded. Key: <span className="font-mono">{question.key}</span>
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-label`}>Label</Label>
            <Input id={`${id}-label`} value={question.label} disabled={!editable} onChange={(e) => onChange({ label: e.target.value })} aria-describedby={problems.length ? errorId : undefined} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-help`}>Help text</Label>
            <Textarea id={`${id}-help`} className="min-h-16" value={question.help ?? ""} disabled={!editable} onChange={(e) => onChange({ help: e.target.value || undefined })} />
          </div>
          <div>
            <Label htmlFor={`${id}-type`}>Answer type</Label>
            <Select id={`${id}-type`} value={question.type} disabled={!editable} onChange={(e) => changeType(e.target.value as FieldType)}>
              {FIELD_TYPES.filter((type) => type !== "table" || question.type === "table").map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2.5 text-sm font-semibold text-ink">
              <input type="checkbox" checked={question.required} disabled={!editable} onChange={(e) => onChange({ required: e.target.checked })} className="h-4 w-4 rounded border-line" />
              Required
            </label>
          </div>
          {question.type === "select" ? (
            <div className="sm:col-span-2">
              <Label htmlFor={`${id}-options`}>Choices</Label>
              <Hint>One choice per line. At least two.</Hint>
              <Textarea id={`${id}-options`} className="min-h-24" value={(question.options ?? []).join("\n")} disabled={!editable} onChange={(e) => onChange({ options: e.target.value.split("\n") })} />
            </div>
          ) : null}
          {question.type === "textarea" ? (
            <div>
              <Label htmlFor={`${id}-words`}>Maximum words</Label>
              <Input id={`${id}-words`} type="number" min={1} className="num" value={question.maxWords ?? ""} disabled={!editable} onChange={(e) => onChange({ maxWords: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          ) : null}
          {question.type === "text" ? (
            <div>
              <Label htmlFor={`${id}-length`}>Maximum characters</Label>
              <Input id={`${id}-length`} type="number" min={1} className="num" value={question.maxLength ?? ""} disabled={!editable} onChange={(e) => onChange({ maxLength: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor={`${id}-when`}>Show only when</Label>
            <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
              <Select
                id={`${id}-when`}
                value={question.visibleWhen?.key ?? ""}
                disabled={!editable}
                onChange={(e) => onChange({ visibleWhen: e.target.value ? { key: e.target.value, equals: question.visibleWhen?.equals ?? "Yes" } : undefined })}
              >
                <option value="">Always shown</option>
                {earlier.map((candidate) => (
                  <option key={candidate.key} value={candidate.key}>
                    {candidate.label}
                  </option>
                ))}
              </Select>
              <Select aria-label="Answer that shows this question" value={question.visibleWhen?.equals ?? "Yes"} disabled={!editable || !question.visibleWhen} onChange={(e) => question.visibleWhen && onChange({ visibleWhen: { key: question.visibleWhen.key, equals: e.target.value } })}>
                <option>Yes</option>
                <option>No</option>
              </Select>
            </div>
            <p className="mt-1 text-xs text-muted">Only earlier yes or no questions can be used.</p>
          </div>
        </div>
      ) : null}
    </li>
  );
}
