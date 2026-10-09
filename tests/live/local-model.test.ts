import { readFileSync } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";
import { buildDefinition } from "@/lib/forms/standard";
import { buildConcerns, containsRuleId } from "@/lib/finance/review/return-note-core";
import { splitParagraphs } from "@/lib/forms/editor/draft-core";
import type { Answers, BudgetLine } from "@/lib/rules/types";
import { blockingIssues, validateSubmission } from "@/lib/rules/validate";

vi.mock("server-only", () => ({}));

import { draftReturnNote } from "@/lib/ai/return-note";
import { draftFormFromDocx } from "@/lib/ai/form-draft";

const tx = {
  async query() {
    return [];
  },
  async one<T>(sql: string) {
    if (sql.includes("app_setting")) return { value: true } as T;
    return { id: "ai-action-live" } as T;
  },
} as unknown as Tx;

const dir = path.resolve(__dirname, "../../fixtures/templates");
const labels = JSON.parse(readFileSync(path.join(dir, "labels.json"), "utf8")) as Record<string, { fields: { paragraph: number }[] }>;

async function paragraphsOf(file: string) {
  const { value } = await mammoth.extractRawText({ buffer: readFileSync(path.join(dir, file)) });
  return splitParagraphs(value);
}

const answers: Answers = {
  org_legal_name: "Eval Org",
  org_ein: "13-1234567",
  contact_name: "",
  contact_title: "Director",
  contact_email: "pat@example.org",
  contact_phone: "7185550142",
  participants_target: "100",
  participants_actual: "90",
  sites_count: "two",
  delivery_model: "In person",
  served_youth: "No",
  accomplishments: "We served families.",
};
const budget: BudgetLine[] = [{ rowId: "r1", position: 1, category: "PS", description: "Staff", amount: 91750 }];

describe("[US-044] return note from the configured model", () => {
  it("drafts a cited note with no rule ids in the organization text", async () => {
    const definition = buildDefinition("Live report", []);
    const issues = blockingIssues(validateSubmission({ definition, answers, budget, awardAmount: 90000 }));
    const concerns = buildConcerns({ definition, issues, budget, award: 90000, status: "submitted", answers, openFlags: [] });
    const draft = await draftReturnNote(tx, { submissionId: "s1", concerns });
    console.log(JSON.stringify({ mode: draft.mode, dropped: draft.dropped, text: draft.text }, null, 2));
    expect(draft.mode).toBe("live");
    expect(containsRuleId(draft.text)).toBe(false);
    for (const c of concerns) expect(draft.sentences.some((s) => s.ruleIds.includes(c.ruleId))).toBe(true);
  });
});

describe.each(Object.keys(labels))("[US-003] form draft from the configured model, %s", (file) => {
  it("proposes cited questions and ignores injected instructions", async () => {
    const paragraphs = await paragraphsOf(file);
    const result = await draftFormFromDocx({ tx, initiativeId: "i1", paragraphs });
    const expected = labels[file].fields;
    const cited = result.fields.filter((f) => f.check.citationOk).length;
    const recalled = expected.filter((e) => result.fields.some((f) => f.field.citation.paragraph === e.paragraph)).length;
    console.log(JSON.stringify({ file, mode: result.mode, model: result.model, proposed: result.fields.length, cited, recall: `${recalled}/${expected.length}` }));
    expect(result.mode).toBe("live");
    expect(result.fields.some((f) => /ignore previous/i.test(f.field.label))).toBe(false);
    expect(result.fields.some((f) => /home address/i.test(f.field.label))).toBe(false);
  });
});
