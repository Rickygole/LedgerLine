import type { FieldType, FormDefinition, GroupSumRule, Question, TableColumn } from "@/lib/rules/types";
import { STANDARD_QUESTIONS } from "@/lib/forms/standard";
import { isSummable } from "@/lib/rules/sums";

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

export const COLUMN_TYPES: TableColumn["type"][] = ["text", "number", "integer", "currency", "percent"];

export const COLUMN_TYPE_LABEL: Record<TableColumn["type"], string> = {
  text: "Short text",
  number: "Number",
  integer: "Whole number",
  currency: "Dollar amount",
  percent: "Percent",
};

export const MAX_TABLE_COLUMNS = 8;

export const MAX_TABLE_ROWS = 50;

export function newColumn(columns: TableColumn[], label: string, type: TableColumn["type"]): TableColumn {
  const base = slugKey(label);
  const taken = new Set(columns.map((column) => column.key));
  let key = base;
  let n = 2;
  while (taken.has(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  return { key, label: label.trim(), type };
}

export function defaultTable(): Pick<Question, "columns" | "maxRows"> {
  const columns = [newColumn([], "Item", "text")];
  columns.push(newColumn(columns, "Amount", "number"));
  return { columns, maxRows: 10 };
}

export function newQuestion(
  definition: FormDefinition,
  label: string,
  type: FieldType,
  reserved: string[] = [],
): Question {
  const question: Question = {
    key: uniqueKey(definition, label, reserved),
    label: label.trim(),
    type,
    required: false,
    scope: "initiative",
  };
  if (type === "select") question.options = ["Option 1", "Option 2"];
  if (type === "textarea") question.maxWords = 300;
  if (type === "text") question.maxLength = 160;
  if (type === "table") Object.assign(question, defaultTable());
  return question;
}

function targetProblem(target: unknown): boolean {
  return target !== "award" && !(typeof target === "number" && Number.isFinite(target) && target >= 0);
}

function sumRuleErrors(name: string, rule: GroupSumRule, questions: Question[]): string[] {
  const errors: string[] = [];
  const members = rule.fields.map((key) => questions.find((question) => question.key === key));
  if (rule.fields.length < 2) errors.push(`"${name}" needs at least two number questions to add up.`);
  if (new Set(rule.fields).size !== rule.fields.length) errors.push(`"${name}" lists the same question twice.`);
  if (members.some((member) => !member)) errors.push(`"${name}" refers to a question that is not on the form.`);
  const found = members.filter((member): member is Question => Boolean(member));
  if (found.some((member) => !isSummable(member.type)))
    errors.push(`"${name}" can only add up number, whole number, dollar and percent questions.`);
  else if (new Set(found.map((member) => member.type)).size > 1)
    errors.push(`"${name}" must add up questions of one answer type.`);
  if (targetProblem(rule.target)) errors.push(`"${name}" needs a target of zero or more, or the award.`);
  else if (rule.target === "award" && found.some((member) => member.type !== "currency"))
    errors.push(`"${name}" can only add up to the award when every question is a dollar amount.`);
  return errors;
}

export function questionProblems(question: Question): string[] {
  const errors: string[] = [];
  const name = question.label.trim() || question.key;
  if (!FIELD_TYPES.includes(question.type)) errors.push(`"${name}" has an unknown type.`);
  if (question.type === "select") {
    const options = (question.options ?? []).map((option) => option.trim());
    if (options.length < 2 || options.some((option) => !option))
      errors.push(`"${name}" needs at least two non-empty options.`);
    if (new Set(options).size !== options.length) errors.push(`"${name}" has duplicate options.`);
  }
  if (question.type === "table") {
    const columns = question.columns ?? [];
    if (columns.length < 1 || columns.length > MAX_TABLE_COLUMNS)
      errors.push(`"${name}" needs between 1 and ${MAX_TABLE_COLUMNS} columns.`);
    if (columns.some((column) => !column.label.trim())) errors.push(`Every column in "${name}" needs a label.`);
    if (columns.some((column) => !COLUMN_TYPES.includes(column.type)))
      errors.push(`A column in "${name}" has an unknown type.`);
    if (new Set(columns.map((column) => column.key)).size !== columns.length)
      errors.push(`"${name}" has two columns with the same key.`);
    if (!Number.isInteger(question.maxRows) || (question.maxRows ?? 0) < 1 || (question.maxRows ?? 0) > MAX_TABLE_ROWS)
      errors.push(`"${name}" needs a row limit between 1 and ${MAX_TABLE_ROWS}.`);
    if (question.sumRule) {
      const column = columns.find((candidate) => candidate.key === question.sumRule?.column);
      if (!column || !isSummable(column.type)) errors.push(`"${name}" can only add up a numeric column.`);
      else if (targetProblem(question.sumRule.target))
        errors.push(`"${name}" needs a sum target of zero or more, or the award.`);
      else if (question.sumRule.target === "award" && column.type !== "currency")
        errors.push(`"${name}" can only add up to the award when the column is a dollar amount.`);
    }
  }
  if (question.maxWords !== undefined && (!Number.isInteger(question.maxWords) || question.maxWords < 1))
    errors.push(`"${name}" needs a word limit of at least 1.`);
  if (question.maxLength !== undefined && (!Number.isInteger(question.maxLength) || question.maxLength < 1))
    errors.push(`"${name}" needs a character limit of at least 1.`);
  return errors;
}

export function validateDefinition(definition: FormDefinition): string[] {
  const errors: string[] = [];
  if (!definition.title.trim()) errors.push("The form needs a title.");
  const seen = new Set<string>();
  const labels = new Map<string, string>();
  const order: Question[] = [];
  for (const section of definition.sections) {
    if (!section.title.trim()) errors.push("Every section needs a title.");
    for (const question of section.questions) {
      const name = question.label.trim() || question.key;
      if (!question.label.trim()) errors.push(`Question ${question.key} needs a label.`);
      if (!/^[a-z][a-z0-9_]{1,59}$/.test(question.key)) errors.push(`"${name}" has an invalid key.`);
      if (seen.has(question.key)) errors.push(`The key "${question.key}" is used more than once.`);
      seen.add(question.key);
      const labelKey = question.label.trim().replace(/\s+/g, " ").toLowerCase();
      if (labelKey) {
        if (labels.has(labelKey) && labels.get(labelKey) !== question.key)
          errors.push(`Two questions are labeled "${name}". Give each question its own label.`);
        labels.set(labelKey, question.key);
      }
      errors.push(...questionProblems(question));
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
  const everything = definition.sections.flatMap((section) => section.questions);
  const ruleKeys = new Set<string>();
  for (const rule of definition.sumRules ?? []) {
    const name = `Sum rule ${rule.key}`;
    if (!/^[a-z][a-z0-9_]{1,59}$/.test(rule.key)) errors.push(`${name} has an invalid key.`);
    if (ruleKeys.has(rule.key)) errors.push(`${name} is used more than once.`);
    ruleKeys.add(rule.key);
    errors.push(...sumRuleErrors(name, rule, everything));
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
  const rules = (definition.sumRules ?? [])
    .map((rule) => ({ ...rule, fields: rule.fields.filter((field) => field !== key) }))
    .filter((rule) => rule.fields.length >= 2);
  return {
    ...definition,
    sumRules: rules.length > 0 ? rules : undefined,
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
