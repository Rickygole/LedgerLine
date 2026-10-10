"use client";

import { FieldError, Hint, Input, Label, OptionalMark, Select, Textarea } from "@/components/ui/field";
import { questionLabel } from "@/lib/report/format";
import { cn } from "@/lib/cn";
import { wordCount } from "@/lib/rules/validate";
import type { AnswerValue, Question } from "@/lib/rules/types";
import { TableQuestion, type TableRow } from "./table-question";
import { plural } from "@/lib/format";

function asText(value: AnswerValue | undefined): string {
  if (value === null || value === undefined || Array.isArray(value)) return "";
  return String(value);
}

function asRows(value: AnswerValue | undefined): TableRow[] {
  return Array.isArray(value) ? (value as TableRow[]) : [];
}

const INPUT_WIDTHS: Partial<Record<Question["type"], string>> = {
  integer: "max-w-[12rem]",
  number: "max-w-[12rem]",
  percent: "max-w-[8rem]",
  currency: "max-w-[16rem]",
  date: "max-w-[12rem]",
  ein: "max-w-[10rem]",
  phone: "max-w-[16rem]",
};

const INPUT_TYPES: Partial<Record<Question["type"], { type: string; inputMode?: "numeric" | "decimal" | "tel" | "email"; autoComplete?: string }>> = {
  email: { type: "email", inputMode: "email", autoComplete: "email" },
  phone: { type: "tel", inputMode: "tel", autoComplete: "tel" },
  date: { type: "date" },
  integer: { type: "text", inputMode: "numeric" },
  number: { type: "text", inputMode: "decimal" },
  currency: { type: "text", inputMode: "decimal" },
  percent: { type: "text", inputMode: "decimal" },
  ein: { type: "text", inputMode: "numeric" },
};

export function QuestionField({
  question,
  value,
  onChange,
  onBlur,
  error,
  disabled,
}: {
  question: Question;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  onBlur: () => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = `q-${question.key}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [question.help ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const numeric = ["integer", "number", "currency", "percent"].includes(question.type);
  const required = question.required ? true : undefined;
  const label = questionLabel(question.label);

  let control: React.ReactNode;

  if (question.type === "textarea") {
    const text = asText(value);
    const words = wordCount(text);
    const over = question.maxWords !== undefined && words > question.maxWords;
    control = (
      <>
        <Textarea
          id={id}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-required={required}
          aria-describedby={[describedBy, `${id}-count`].filter(Boolean).join(" ")}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          rows={6}
        />
        <p id={`${id}-count`} className={cn("mt-1.5 text-xs", over ? "font-semibold text-bad" : "text-muted")}>
          {words} {plural(words, "word", "words")}
          {question.maxWords ? ` of ${question.maxWords} allowed` : ""}
          {over ? `. Remove ${words - (question.maxWords ?? 0)} to continue.` : ""}
        </p>
      </>
    );
  } else if (question.type === "select") {
    control = (
      <Select id={id} value={asText(value)} aria-invalid={error ? true : undefined} aria-required={required} aria-describedby={describedBy} disabled={disabled} onChange={(event) => onChange(event.target.value)} onBlur={onBlur}>
        <option value="">Choose one</option>
        {(question.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    );
  } else if (question.type === "yesno") {
    control = (
      <div id={id} role="radiogroup" tabIndex={-1} aria-required={required} aria-invalid={error ? true : undefined} aria-labelledby={`${id}-legend`} aria-describedby={describedBy} className="flex gap-3">
        {["Yes", "No"].map((option) => (
          <label
            key={option}
            className={cn(
              "inline-flex h-10 min-w-24 cursor-pointer items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold shadow-sm",
              asText(value) === option ? "border-harbor-700 bg-harbor-50 text-harbor-900" : "border-line bg-white text-ink hover:bg-harbor-50",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <input
              type="radio"
              name={id}
              value={option}
              checked={asText(value) === option}
              disabled={disabled}
              onChange={() => {
                onChange(option);
                onBlur();
              }}
              className="h-4 w-4 accent-harbor-800"
            />
            {option}
          </label>
        ))}
      </div>
    );
  } else if (question.type === "table") {
    control = <TableQuestion question={question} rows={asRows(value)} onChange={onChange} onBlur={onBlur} describedBy={describedBy} invalid={Boolean(error)} />;
  } else {
    const spec = INPUT_TYPES[question.type] ?? { type: "text" };
    const width = INPUT_WIDTHS[question.type];
    control = (
      <div className={cn("relative", width)}>
        {question.type === "currency" ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted" aria-hidden="true">
            $
          </span>
        ) : null}
        <Input
          id={id}
          type={spec.type}
          inputMode={spec.inputMode}
          autoComplete={spec.autoComplete}
          value={asText(value)}
          aria-invalid={error ? true : undefined}
          aria-required={required}
          aria-describedby={describedBy}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          className={cn(numeric && "num", question.type === "currency" && "pl-7", question.type === "percent" && "pr-8")}
        />
        {question.type === "percent" ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted" aria-hidden="true">
            %
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {question.type === "yesno" || question.type === "table" ? (
        <p id={`${id}-legend`} className="mb-1.5 text-sm font-semibold text-ink">
          {label}
          {question.required ? null : <OptionalMark />}
        </p>
      ) : (
        <Label htmlFor={id} optional={!question.required}>
          {label}
        </Label>
      )}
      {question.help ? <Hint id={hintId}>{question.help}</Hint> : null}
      {control}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}
