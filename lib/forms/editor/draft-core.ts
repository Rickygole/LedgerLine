import { z } from "zod";
import { createHash } from "node:crypto";
import { STANDARD_QUESTIONS } from "@/lib/forms/standard";
import { DRAFTABLE_TYPES, uniqueKey } from "@/lib/forms/editor/definition";
import type { FormDefinition, Question } from "@/lib/rules/types";

export const SECTION_KEYS = ["performance", "narrative", "organization"] as const;
export type DraftSection = (typeof SECTION_KEYS)[number];

export const LIBRARY_KEYS = STANDARD_QUESTIONS.map((q) => q.key);

export type ProposedField = {
  label: string;
  help?: string;
  type: string;
  required: boolean;
  options?: string[];
  max_words?: number;
  section: string;
  library_key?: string;
  citation: { paragraph: number; quote: string };
};

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

export function templateSha(paragraphs: string[]): string {
  return createHash("sha256").update(normalizedTemplate(paragraphs)).digest("hex");
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
  if (!(DRAFTABLE_TYPES as string[]).includes(field.type)) problems.push("Type is not allowed");
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

export function parseWithRules(paragraphs: string[]): ProposedField[] {
  const fields: ProposedField[] = [];
  paragraphs.forEach((paragraph, index) => {
    const { body, numbered } = stripNumber(paragraph);
    const endsLikeQuestion = /[?:]$/.test(body);
    const withOptions = parseOptions(body);
    if (!numbered && !endsLikeQuestion && !withOptions) return;
    if (/^(budget|attach|instructions?|note|sample template|return|submit)\b/i.test(body)) return;
    if (body.length < 6) return;
    const optional = /\(\s*optional\s*\)/i.test(body);
    let working = body.replace(/\(\s*optional\s*\)\.?/i, "").trim();
    const hadQuestionMark = /\?\s*$/.test(working) || /\?\s*\(/.test(working);
    let options: string[] | undefined;
    let stem = working;
    if (withOptions) {
      stem = withOptions.stem;
      options = withOptions.options;
    }
    stem = stem.replace(/\(\s*yes\s*\/\s*no\s*\)/i, "").replace(/[:\s]+$/, "").trim();
    working = stem;
    const detected = options ? { type: "select" as const, maxWords: undefined } : detectType(stem, hadQuestionMark);
    const label = collapse(stem.replace(/^(describe|explain)\b/i, (m) => m[0].toUpperCase() + m.slice(1).toLowerCase())).replace(/[.:]+$/, "");
    if (!label) return;
    const field: ProposedField = {
      label,
      type: detected.type,
      required: !optional,
      section: detectSection(label, detected.type),
      citation: { paragraph: index + 1, quote: collapse(paragraph).slice(0, 160) },
    };
    if (options) field.options = options;
    if (detected.maxWords) field.max_words = detected.maxWords;
    const library = LIBRARY_RULES.find(([pattern]) => pattern.test(label));
    if (library) field.library_key = library[1];
    fields.push(field);
  });
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
  for (const field of fields) {
    const section = next.sections.find((s) => s.kind === "questions" && s.key === field.section) ?? fallbackSection;
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
