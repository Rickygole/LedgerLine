import { z } from "zod";
import { STANDARD_QUESTIONS } from "@/lib/forms/standard";
import { DRAFTABLE_TYPES, slugKey, uniqueKey } from "@/lib/forms/editor/definition";
import type { FormDefinition, Question } from "@/lib/rules/types";

export const SECTION_KEYS = ["performance", "narrative", "organization"] as const;
export type DraftSection = (typeof SECTION_KEYS)[number];

export const LIBRARY_KEYS = STANDARD_QUESTIONS.map((q) => q.key);

export type ProposedColumn = { label: string; type: "text" | "integer" | "currency" | "percent" };

export type ProposedField = {
  label: string;
  help?: string;
  type: string;
  required: boolean;
  options?: string[];
  max_words?: number;
  section: string;
  library_key?: string;
  columns?: ProposedColumn[];
  section_title?: string;
  citation: { paragraph: number; quote: string };
};

export type TemplateCell = { text: string; paragraph: number | null };

export type TemplateStructure = {
  headings: { paragraph: number; text: string }[];
  tables: { first: number; last: number; rows: TemplateCell[][] }[];
  listItems: number[];
};

const STRUCTURES = new WeakMap<string[], TemplateStructure>();

export function attachStructure(paragraphs: string[], structure: TemplateStructure): string[] {
  STRUCTURES.set(paragraphs, structure);
  return paragraphs;
}

export function structureOf(paragraphs: string[]): TemplateStructure | undefined {
  return STRUCTURES.get(paragraphs);
}

export const COLUMN_TYPES = ["text", "integer", "currency", "percent"] as const;

export const proposalSchema = z.object({
  questions: z.array(
    z.object({
      label: z.string().min(1),
      help: z.string().optional(),
      type: z.string(),
      required: z.boolean(),
      options: z.array(z.string()).optional(),
      max_words: z.number().int().optional(),
      section: z.string(),
      library_key: z.string().optional(),
      columns: z.array(z.object({ label: z.string().min(1), type: z.enum(COLUMN_TYPES) })).optional(),
      section_title: z.string().optional(),
      citation: z.object({ paragraph: z.number().int(), quote: z.string() }),
    })
  ),
});

export const JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "type", "required", "section", "citation"],
        properties: {
          label: { type: "string" },
          help: { type: "string" },
          type: { type: "string", enum: DRAFTABLE_TYPES },
          required: { type: "boolean" },
          options: { type: "array", items: { type: "string" } },
          max_words: { type: "integer" },
          section: { type: "string", enum: [...SECTION_KEYS] },
          library_key: { type: "string", enum: LIBRARY_KEYS },
          citation: {
            type: "object",
            additionalProperties: false,
            required: ["paragraph", "quote"],
            properties: { paragraph: { type: "integer" }, quote: { type: "string" } },
          },
        },
      },
    },
  },
};

export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function splitParagraphs(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => collapse(line))
    .filter((line) => line.length > 0);
}

export function normalizedTemplate(paragraphs: string[]): string {
  return paragraphs.map((p) => collapse(p)).join("\n");
}

export function quotedData(paragraphs: string[]): string {
  return paragraphs.map((p, i) => `[${i + 1}] "${p.replace(/"/g, "'")}"`).join("\n");
}

export function checkCitation(paragraphs: string[], citation: { paragraph: number; quote: string } | undefined): boolean {
  if (!citation || !Number.isInteger(citation.paragraph)) return false;
  const text = paragraphs[citation.paragraph - 1];
  if (text === undefined) return false;
  const quote = collapse(citation.quote ?? "");
  if (!quote) return false;
  return collapse(text).includes(quote);
}

export type FieldCheck = { ok: boolean; citationOk: boolean; problems: string[] };

export function checkField(paragraphs: string[], field: ProposedField): FieldCheck {
  const problems: string[] = [];
  const citationOk = checkCitation(paragraphs, field.citation);
  if (!citationOk) problems.push("Citation not found in the template");
  if (!field.label.trim()) problems.push("Label is empty");
  if (!(DRAFTABLE_TYPES as string[]).includes(field.type) && field.type !== "table") problems.push("Type is not allowed");
  if (field.type === "table") {
    const columns = field.columns ?? [];
    if (columns.length === 0 || columns.length > 8 || columns.some((column) => !column.label.trim())) problems.push("A table needs one to eight named columns");
  }
  if (!(SECTION_KEYS as readonly string[]).includes(field.section)) problems.push("Section is not allowed");
  if (field.library_key !== undefined && !LIBRARY_KEYS.includes(field.library_key)) problems.push("Library question does not exist");
  if (field.type === "select") {
    const options = (field.options ?? []).map((option) => option.trim());
    if (options.length < 2 || options.some((option) => !option)) problems.push("A choice list needs at least two options");
  }
  if (field.max_words !== undefined && (!Number.isInteger(field.max_words) || field.max_words < 1)) problems.push("Word limit must be at least 1");
  return { ok: problems.length === 0, citationOk, problems };
}

export function injectionNotices(paragraphs: string[]): string[] {
  const pattern = /(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier)\b.{0,20}\b(instruction|prompt|rule)s?|\b(you must|you are now|system prompt)\b/i;
  const notices: string[] = [];
  paragraphs.forEach((text, index) => {
    if (pattern.test(text)) notices.push(`Paragraph ${index + 1} reads like an instruction to the drafting tool. It was treated as template text and ignored.`);
  });
  return notices;
}

const LIBRARY_RULES: Array<[RegExp, string]> = [
  [/\bchallenges?\b|\bbarriers?\b/i, "challenges"],
  [/success story|participant story|story that shows/i, "success_story"],
  [/key accomplishments?|major accomplishments?/i, "accomplishments"],
  [/number of (program )?sites|sites where/i, "sites_count"],
  [/contact name|name of (the )?(report )?contact/i, "contact_name"],
  [/contact email|email of (the )?contact/i, "contact_email"],
  [/contact phone|phone of (the )?contact/i, "contact_phone"],
  [/legal name of (the )?organization|organization legal name/i, "org_legal_name"],
  [/\bein\b|employer identification/i, "org_ein"],
];

function stripNumber(text: string): { body: string; numbered: boolean } {
  const match = text.match(/^\s*(?:Q\s*)?(\d{1,3})\s*[.):]\s+(.*)$/i);
  if (match) return { body: match[2].trim(), numbered: true };
  return { body: text.trim(), numbered: false };
}

function parseOptions(body: string): { stem: string; options: string[] } | null {
  const marker = /(\(\s*\)|\[\s*\]|☐|□)/;
  if (!marker.test(body)) return null;
  const parts = body.split(/(?:\(\s*\)|\[\s*\]|☐|□)/);
  const stem = parts[0].trim();
  const options = parts
    .slice(1)
    .map((part) => collapse(part).replace(/[,;]$/, "").trim())
    .filter(Boolean);
  if (options.length < 2) return null;
  return { stem, options };
}

const YES_NO_TAIL = /\s*[(\[]?\s*yes\s*(?:\/|\bor\b|\|)\s*no\s*[)\]]?\s*[.?]?\s*$/i;

function plausibleOptions(parts: string[]): boolean {
  if (parts.length < 2 || parts.length > 12) return false;
  return parts.every((part) => part.length > 0 && part.length <= 40 && part.split(/\s+/).length <= 5 && !/^(e\.g\.|i\.e\.|for example|such as)/i.test(part));
}

function splitList(inner: string): string[] | null {
  if (/\b(words?|characters?|optional|required|max|maximum)\b/i.test(inner)) return null;
  if (/[\/|;]/.test(inner)) {
    const parts = inner.split(/\s*[\/|;]\s*/).map((part) => collapse(part).replace(/^(?:or|and)\s+/i, "")).filter(Boolean);
    return plausibleOptions(parts) ? parts : null;
  }
  if (/,\s*(?:or|and)\s+\S/i.test(inner) || /\s+or\s+/i.test(inner)) {
    const parts = inner.split(/\s*,\s*(?:or\s+|and\s+)?|\s+or\s+/i).map((part) => collapse(part)).filter(Boolean);
    return plausibleOptions(parts) ? parts : null;
  }
  return null;
}

function trailingOptions(stem: string): { stem: string; options: string[] } | null {
  const inParens = stem.match(/^(.*?)\s*\(([^()]+)\)\s*[.?:]?\s*$/);
  if (inParens) {
    const options = splitList(inParens[2]);
    if (options) return { stem: inParens[1].trim(), options };
  }
  const afterColon = stem.match(/^(.+?[?:])\s+([^?:]+)$/);
  if (afterColon && /\//.test(afterColon[2])) {
    const options = splitList(afterColon[2].replace(/\.$/, ""));
    if (options) return { stem: afterColon[1].trim(), options };
  }
  const afterVerb = stem.match(/^(.*?\b(?:choose|select|pick)(?: one| all that apply)?(?: of)?\s*:)\s*(.+)$/i);
  if (afterVerb) {
    const options = splitList(afterVerb[2].replace(/\.$/, ""));
    if (options) return { stem: afterVerb[1].replace(/\s*(?:choose|select|pick)(?: one| all that apply)?(?: of)?\s*:$/i, "").trim() || afterVerb[1], options };
  }
  return null;
}

function detectType(stem: string, hadQuestionMark: boolean): { type: Exclude<(typeof DRAFTABLE_TYPES)[number], never>; maxWords?: number } {
  const text = stem.toLowerCase();
  if (/\b(yes\s*\/\s*no|yes or no)\b/.test(text)) return { type: "yesno" };
  if (hadQuestionMark && /^(did|does|do|is|are|was|were|has|have|will|can|could)\b/.test(text)) return { type: "yesno" };
  if (/^(number of|how many|count of|total number of|total count)/.test(text)) return { type: "integer" };
  if (/\bpercent(age)?\b|%/.test(text)) return { type: "percent" };
  if (/^(describe|explain|summarize|discuss|tell us|provide a (narrative|description|summary))/.test(text)) return { type: "textarea", maxWords: 300 };
  if (/\be-?mail\b/.test(text)) return { type: "email" };
  if (/\bphone\b|\btelephone\b/.test(text)) return { type: "phone" };
  if (/^date\b|\bdate of\b|\bdate\b.*\b(last|final|first)\b/.test(text)) return { type: "date" };
  if (/\b(dollar|amount|\$|cost of|funds raised|revenue)\b/.test(text)) return { type: "currency" };
  return { type: "text" };
}

function detectSection(label: string, type: string): DraftSection {
  if (type === "textarea") return "narrative";
  if (/\b(contact|organization|agency|director|address|phone|email|ein)\b/i.test(label) && type !== "integer") return "organization";
  return "performance";
}

function sectionForHeading(heading: string | undefined, label: string, type: string): DraftSection {
  if (heading) {
    if (/\b(narrative|story|stories|challenges?|outcomes?|description|accomplishments?)\b/i.test(heading) && type === "textarea") return "narrative";
    if (/\b(organization|contact|about (you|your))\b/i.test(heading) && type !== "integer") return "organization";
  }
  return detectSection(label, type);
}

const HEADING_PREFIX = /^\s*(?:section|part|module)\s+[0-9a-z]{1,4}\s*[:.\-–—]\s*/i;

export function headingTitle(text: string): string {
  const cleaned = collapse(text.replace(HEADING_PREFIX, "")).replace(/[:.\s]+$/, "");
  return cleaned.length > 80 ? cleaned.slice(0, 80).trim() : cleaned;
}

function inferStructure(paragraphs: string[]): TemplateStructure {
  const headings: TemplateStructure["headings"] = [];
  paragraphs.forEach((text, index) => {
    if (HEADING_PREFIX.test(text) && !/[?]$/.test(text.trim()) && text.length <= 100) headings.push({ paragraph: index + 1, text });
  });
  return { headings, tables: [], listItems: [] };
}

function columnType(label: string): ProposedColumn["type"] {
  const text = label.toLowerCase();
  if (/\bpercent(age)?\b|%/.test(text)) return "percent";
  if (/\b(amount|cost|dollars?|\$|funds?|revenue|spent|budget)\b/.test(text)) return "currency";
  if (/\b(number|count|total|how many|sessions?|hours|participants?|clients|people|attendees|enrolled|served|trained|held|completed|seniors|youth|students|visits|meals|made|loans?|events|workshops|referrals|meetings|classes)\b/.test(text)) return "integer";
  return "text";
}

function tablePromptLabel(text: string): string {
  const { body } = stripNumber(text);
  const label = collapse(body)
    .replace(/\s*(?:in|using|with)?\s*(?:the|this)?\s*(?:table|grid|chart)?\s*(?:below|as follows|that follows|following)\s*[.:]?$/i, "")
    .replace(/[.:\s]+$/, "")
    .trim();
  return label;
}

type Classified = { field: ProposedField; numbered: boolean };

function classify(paragraph: string, index: number, heading: string | undefined, listItem: boolean): Classified | null {
  const { body, numbered: wasNumbered } = stripNumber(paragraph);
  const numbered = wasNumbered || listItem;
  const endsLikeQuestion = /[?:]$/.test(body);
  const withMarkers = parseOptions(body);
  const yesNoTail = YES_NO_TAIL.test(body);
  const listed = trailingOptions(body.replace(YES_NO_TAIL, ""));
  if (!numbered && !endsLikeQuestion && !withMarkers && !yesNoTail && !listed) return null;
  if (/^(budget|attach|instructions?|note|sample template|return|submit)\b/i.test(body)) return null;
  if (body.length < 6) return null;
  const optional = /\(\s*optional\s*\)/i.test(body);
  let working = body.replace(/\(\s*optional\s*\)\.?/i, "").trim();
  let maxWords: number | undefined;
  working = working.replace(/\s*\(\s*(?:max(?:imum)?\.?|up to|limit)?\s*(\d{1,4})\s*words?(?:\s*(?:max(?:imum)?|or fewer|or less))?\s*\)\s*/i, (_m, n: string) => {
    maxWords = Number(n);
    return " ";
  }).trim();
  const hadQuestionMark = /\?\s*$/.test(working) || /\?\s*\(/.test(working) || /\?\s*yes\s*(\/|or)\s*no/i.test(working);
  let options: string[] | undefined;
  let stem = working;
  let forceYesNo = false;
  if (withMarkers) {
    stem = withMarkers.stem;
    options = withMarkers.options;
  } else if (yesNoTail) {
    stem = working.replace(YES_NO_TAIL, "").trim();
    forceYesNo = true;
  } else {
    const found = trailingOptions(working);
    if (found) {
      stem = found.stem;
      options = found.options;
    }
  }
  stem = stem.replace(/\(\s*yes\s*\/\s*no\s*\)/i, "").replace(/[:\s]+$/, "").trim();
  const detected = forceYesNo ? { type: "yesno" as const, maxWords: undefined } : options ? { type: "select" as const, maxWords: undefined } : detectType(stem, hadQuestionMark);
  const label = collapse(stem.replace(/^(describe|explain)\b/i, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase())).replace(/[.:\s]+$/, "");
  if (!label) return null;
  const field: ProposedField = {
    label,
    type: detected.type,
    required: !optional,
    section: sectionForHeading(heading, label, detected.type),
    citation: { paragraph: index + 1, quote: collapse(paragraph).slice(0, 160) },
  };
  if (options) field.options = options;
  const words = maxWords ?? detected.maxWords;
  if (words && detected.type === "textarea") field.max_words = words;
  const library = LIBRARY_RULES.find(([pattern]) => pattern.test(label));
  if (library) field.library_key = library[1];
  return { field, numbered };
}

function isLabelAnswerTable(rows: TemplateCell[][]): boolean {
  if (rows.length < 2) return false;
  if (!rows.every((row) => row.length >= 2 && row[0].text.trim() !== "" && row.slice(1).every((cell) => cell.text.trim() === ""))) return false;
  return rows.every((row) => /[?:]$/.test(row[0].text.trim()) || row[0].text.trim().split(/\s+/).length >= 2);
}

export function parseWithRules(paragraphs: string[], structure?: TemplateStructure): ProposedField[] {
  const layout = structure ?? structureOf(paragraphs) ?? inferStructure(paragraphs);
  const headingAt = new Map(layout.headings.map((h) => [h.paragraph, h.text]));
  const tableAt = new Map(layout.tables.map((t) => [t.first, t]));
  const inTable = new Set<number>();
  for (const table of layout.tables) for (let n = table.first; n <= table.last; n += 1) inTable.add(n);
  const listItems = new Set(layout.listItems);
  const fields: ProposedField[] = [];
  let current: string | undefined;
  let titleFor: string | undefined;
  const withTitle = (field: ProposedField): ProposedField => (titleFor ? { ...field, section_title: titleFor } : field);

  for (let n = 1; n <= paragraphs.length; n += 1) {
    const paragraph = paragraphs[n - 1];
    const heading = headingAt.get(n);
    if (heading !== undefined) {
      current = heading;
      const title = headingTitle(heading);
      titleFor = title || undefined;
      continue;
    }
    const table = tableAt.get(n);
    if (table) {
      const header = table.rows[0]?.filter((cell) => cell.text.trim() !== "") ?? [];
      if (isLabelAnswerTable(table.rows)) {
        for (const row of table.rows) {
          const cell = row[0];
          const made = classify(cell.text, (cell.paragraph ?? n) - 1, current, true);
          if (made) fields.push(withTitle(made.field));
        }
        continue;
      }
      if (header.length === 0) continue;
      const columns: ProposedColumn[] = header.slice(0, 8).map((cell) => ({ label: collapse(cell.text), type: columnType(cell.text) }));
      const previous = n - 1;
      const promptText = previous >= 1 && !headingAt.has(previous) && !inTable.has(previous) ? paragraphs[previous - 1] : undefined;
      const last = fields[fields.length - 1];
      const promptField = last && last.citation.paragraph === previous ? last : undefined;
      if (promptField) fields.pop();
      const promptLabel = promptText && (promptField || /\b(below|following|list|table|each)\b/i.test(promptText)) ? tablePromptLabel(promptText) : "";
      const required = promptField ? promptField.required : true;
      const label = promptLabel || (current ? headingTitle(current) : "") || "Table";
      const anchor = promptLabel && promptText ? { paragraph: previous, quote: collapse(promptText).slice(0, 160) } : { paragraph: header[0].paragraph ?? n, quote: collapse(header[0].text).slice(0, 160) };
      fields.push(
        withTitle({
          label,
          type: "table",
          required,
          section: "performance",
          columns,
          citation: anchor,
        })
      );
      continue;
    }
    if (inTable.has(n)) continue;
    const made = classify(paragraph, n - 1, current, listItems.has(n));
    if (made) fields.push(withTitle(made.field));
  }
  return fields;
}

export function toQuestion(definition: FormDefinition, field: ProposedField, extraKeys: string[]): Question {
  const question: Question = {
    key: uniqueKey(definition, field.label, extraKeys),
    label: field.label.trim(),
    type: field.type as Question["type"],
    required: field.required,
    scope: "initiative",
    citation: { paragraph: field.citation.paragraph, quote: collapse(field.citation.quote) },
  };
  if (field.help?.trim()) question.help = field.help.trim();
  if (field.type === "select") question.options = (field.options ?? []).map((option) => option.trim());
  if (field.type === "table") {
    const taken: string[] = [];
    question.columns = (field.columns ?? []).map((column) => {
      let key = slugKey(column.label);
      let n = 2;
      while (taken.includes(key)) {
        key = `${slugKey(column.label)}_${n}`;
        n += 1;
      }
      taken.push(key);
      return { key, label: column.label.trim(), type: column.type };
    });
    question.maxRows = 20;
  }
  if (field.type === "textarea") question.maxWords = field.max_words ?? 300;
  if (field.type === "text") question.maxLength = 160;
  return question;
}

export type MergeOutcome = { definition: FormDefinition; added: string[]; linked: string[]; alreadyPresent: string[] };

export function mergeFields(definition: FormDefinition, fields: ProposedField[]): MergeOutcome {
  const next: FormDefinition = JSON.parse(JSON.stringify(definition));
  const added: string[] = [];
  const linked: string[] = [];
  const alreadyPresent: string[] = [];
  const present = () => new Set(next.sections.flatMap((s) => s.questions.map((q) => q.key)));
  const fallbackSection = next.sections.find((s) => s.kind === "questions" && s.key === "performance") ?? next.sections.find((s) => s.kind === "questions");
  if (!fallbackSection) return { definition: next, added, linked, alreadyPresent };
  const sectionFor = (field: ProposedField) => {
    const title = field.section_title ? collapse(field.section_title).slice(0, 80) : "";
    if (!title) return next.sections.find((s) => s.kind === "questions" && s.key === field.section) ?? fallbackSection;
    const existing = next.sections.find((s) => s.kind === "questions" && collapse(s.title).toLowerCase() === title.toLowerCase());
    if (existing) return existing;
    const keys = new Set(next.sections.map((s) => s.key));
    let key = slugKey(title);
    let n = 2;
    while (keys.has(key)) {
      key = `${slugKey(title)}_${n}`;
      n += 1;
    }
    const created: FormDefinition["sections"][number] = { key, title, kind: "questions", questions: [] };
    const budgetAt = next.sections.findIndex((s) => s.kind === "budget");
    if (budgetAt === -1) next.sections.push(created);
    else next.sections.splice(budgetAt, 0, created);
    return created;
  };
  for (const field of fields) {
    const section = field.library_key ? (next.sections.find((s) => s.kind === "questions" && s.key === field.section) ?? fallbackSection) : sectionFor(field);
    if (field.library_key) {
      const standard = STANDARD_QUESTIONS.find((q) => q.key === field.library_key);
      if (standard && present().has(standard.key)) {
        alreadyPresent.push(field.label);
        continue;
      }
      if (standard) {
        section.questions.push(JSON.parse(JSON.stringify(standard)) as Question);
        linked.push(standard.key);
        continue;
      }
    }
    const question = toQuestion(next, field, []);
    section.questions.push(question);
    added.push(question.key);
  }
  return { definition: next, added, linked, alreadyPresent };
}
