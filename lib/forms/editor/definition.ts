import type { FieldType, FormDefinition, Question } from "@/lib/rules/types";
import { STANDARD_QUESTIONS } from "@/lib/forms/standard";

export const FIELD_TYPES: FieldType[] = [
  "text",
  "textarea",
  "number",
  "integer",
  "currency",
  "percent",
  "date",
  "email",
  "phone",
  "ein",
  "select",
  "yesno",
  "table",
];

export const DRAFTABLE_TYPES = FIELD_TYPES.filter((type) => type !== "table") as Exclude<FieldType, "table">[];

export const TYPE_LABEL: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  integer: "Whole number",
  currency: "Dollar amount",
  percent: "Percent",
  date: "Date",
  email: "Email address",
  phone: "Phone number",
  ein: "EIN",
  select: "Choice list",
  yesno: "Yes or no",
  table: "Table",
};

export function slugKey(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .split("_")
    .slice(0, 6)
    .join("_")
    .slice(0, 48);
  const key = base || "question";
  return /^[a-z]/.test(key) ? key : `q_${key}`;
}

function allQuestions(definition: FormDefinition): Question[] {
  return definition.sections.flatMap((section) => section.questions);
}

export function uniqueKey(definition: FormDefinition, label: string, extra: string[] = []): string {
  const taken = new Set([
    ...allQuestions(definition).map((q) => q.key),
    ...STANDARD_QUESTIONS.map((q) => q.key),
    ...extra,
  ]);
  const base = slugKey(label);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function newQuestion(definition: FormDefinition, label: string, type: FieldType): Question {
  const question: Question = {
    key: uniqueKey(definition, label),
    label: label.trim(),
    type,
    required: false,
    scope: "initiative",
  };
  if (type === "select") question.options = ["Option 1", "Option 2"];
  if (type === "textarea") question.maxWords = 300;
  if (type === "text") question.maxLength = 160;
  return question;
}

export function validateDefinition(definition: FormDefinition): string[] {
  const errors: string[] = [];
  if (!definition.title.trim()) errors.push("The form needs a title.");
  const seen = new Set<string>();
  const order: Question[] = [];
  for (const section of definition.sections) {
    if (!section.title.trim()) errors.push("Every section needs a title.");
    for (const question of section.questions) {
      const name = question.label.trim() || question.key;
      if (!question.label.trim()) errors.push(`Question ${question.key} needs a label.`);
      if (!/^[a-z][a-z0-9_]{1,59}$/.test(question.key)) errors.push(`"${name}" has an invalid key.`);
      if (seen.has(question.key)) errors.push(`The key "${question.key}" is used more than once.`);
      seen.add(question.key);
      if (!FIELD_TYPES.includes(question.type)) errors.push(`"${name}" has an unknown type.`);
      if (question.type === "select") {
        const options = (question.options ?? []).map((option) => option.trim());
        if (options.length < 2 || options.some((option) => !option))
          errors.push(`"${name}" needs at least two non-empty options.`);
        if (new Set(options).size !== options.length) errors.push(`"${name}" has duplicate options.`);
      }
      if (question.maxWords !== undefined && (!Number.isInteger(question.maxWords) || question.maxWords < 1))
        errors.push(`"${name}" needs a word limit of at least 1.`);
      if (question.maxLength !== undefined && (!Number.isInteger(question.maxLength) || question.maxLength < 1))
        errors.push(`"${name}" needs a character limit of at least 1.`);
      if (question.visibleWhen) {
        const target = order.find((earlier) => earlier.key === question.visibleWhen?.key);
        if (!target) errors.push(`"${name}" is shown only when a question that does not come earlier in the form.`);
        else if (target.type !== "yesno") errors.push(`"${name}" can only depend on a yes or no question.`);
        else if (!["Yes", "No"].includes(question.visibleWhen.equals))
          errors.push(`"${name}" must be shown when the answer is Yes or No.`);
      }
      order.push(question);
    }
  }
  if (
    !definition.budget.enabled ||
    !definition.budget.mustEqualAward ||
    !definition.sections.some((section) => section.kind === "budget")
  ) {
    errors.push("Every form must keep the budget section, and the budget total must equal the award.");
  }
  const { maxLines } = definition.budget;
  if (!Number.isInteger(maxLines) || maxLines < 1 || maxLines > 100)
    errors.push("Budget lines must be between 1 and 100.");
  return errors;
}

export function moveQuestion(
  definition: FormDefinition,
  sectionKey: string,
  index: number,
  direction: -1 | 1,
): FormDefinition {
  return {
    ...definition,
    sections: definition.sections.map((section) => {
      if (section.key !== sectionKey) return section;
      const target = index + direction;
      if (target < 0 || target >= section.questions.length) return section;
      const questions = [...section.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...section, questions };
    }),
  };
}

export function updateQuestion(definition: FormDefinition, key: string, patch: Partial<Question>): FormDefinition {
  return {
    ...definition,
    sections: definition.sections.map((section) => ({
      ...section,
      questions: section.questions.map((question) => (question.key === key ? { ...question, ...patch } : question)),
    })),
  };
}

export function removeQuestion(definition: FormDefinition, key: string): FormDefinition {
  const dependents = (question: Question) => question.visibleWhen?.key === key;
  return {
    ...definition,
    sections: definition.sections.map((section) => ({
      ...section,
      questions: section.questions
        .filter((question) => question.key !== key)
        .map((question) => (dependents(question) ? { ...question, visibleWhen: undefined } : question)),
    })),
  };
}

export function addQuestion(definition: FormDefinition, sectionKey: string, question: Question): FormDefinition {
  return {
    ...definition,
    sections: definition.sections.map((section) =>
      section.key === sectionKey ? { ...section, questions: [...section.questions, question] } : section,
    ),
  };
}

export function earlierYesNo(definition: FormDefinition, key: string): Question[] {
  const result: Question[] = [];
  for (const question of allQuestions(definition)) {
    if (question.key === key) break;
    if (question.type === "yesno") result.push(question);
  }
  return result;
}

export function cleanDefinition(definition: FormDefinition): FormDefinition {
  return JSON.parse(JSON.stringify(definition)) as FormDefinition;
}
