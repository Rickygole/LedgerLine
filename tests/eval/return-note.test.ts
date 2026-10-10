import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";
import { buildDefinition } from "@/lib/forms/standard";
import {
  buildConcerns,
  containsRuleId,
  dollarFigures,
  PRESET_CONCERNS,
  type Concern,
} from "@/lib/finance/review/return-note-core";
import type { Answers, BudgetLine } from "@/lib/rules/types";
import { blockingIssues, validateSubmission } from "@/lib/rules/validate";

vi.mock("server-only", () => ({}));

const live = vi.hoisted(() => ({ result: null as unknown }));

vi.mock("@/lib/ai/model", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/model")>();
  return { ...original, callStructured: vi.fn(async () => live.result) };
});

import { draftReturnNote } from "@/lib/ai/return-note";

const definition = buildDefinition("Eval report", []);

const complete: Answers = {
  org_legal_name: "Eval Org",
  org_ein: "00-1234567",
  contact_name: "Pat Example",
  contact_title: "Director",
  contact_email: "pat@example.org",
  contact_phone: "7185550142",
  participants_target: "100",
  participants_actual: "90",
  sites_count: "2",
  delivery_model: "In person",
  served_youth: "No",
  accomplishments: "We served families.",
};

const line = (amount: number): BudgetLine[] => [
  { rowId: "r1", position: 1, category: "PS", description: "Staff", amount },
];

type Case = {
  name: string;
  answers: Answers;
  budget: BudgetLine[];
  award: number;
  extra?: Concern[];
  flags?: { id: string; kind: string; note: string | null }[];
  status?: string;
};

const cases: Case[] = [
  {
    name: "missing required contact email",
    answers: { ...complete, contact_email: "" },
    budget: line(90000),
    award: 90000,
  },
  { name: "unbalanced budget", answers: complete, budget: line(91750), award: 90000 },
  {
    name: "participant count is not a whole number",
    answers: { ...complete, participants_target: "about 100" },
    budget: line(90000),
    award: 90000,
  },
  {
    name: "narrative too long",
    answers: { ...complete, accomplishments: Array.from({ length: 520 }, () => "word").join(" ") },
    budget: line(90000),
    award: 90000,
  },
  {
    name: "several rules plus presets and a flag",
    answers: { ...complete, contact_name: "", sites_count: "two" },
    budget: line(88500.5),
    award: 90000,
    extra: PRESET_CONCERNS,
    flags: [{ id: "f1", kind: "manual", note: "Check invoice for Alex Rivera at alex@example.org" }],
  },
];

function concernsFor(c: Case): Concern[] {
  const issues = blockingIssues(
    validateSubmission({ definition, answers: c.answers, budget: c.budget, awardAmount: c.award }),
  );
  return [
    ...buildConcerns({
      definition,
      issues,
      budget: c.budget,
      award: c.award,
      status: c.status ?? "submitted",
      answers: c.answers,
      openFlags: c.flags ?? [],
    }),
    ...(c.extra ?? []),
  ];
}

function fakeTx(aiOn = true): Tx {
  return {
    async query() {
      return [];
    },
    async one<T>(sql: string) {
      if (sql.includes("app_setting")) return { value: aiOn } as T;
      return { id: "ai-action-1" } as T;
    },
  } as unknown as Tx;
}

beforeEach(() => {
  live.result = null;
});

describe.each(cases)("return note, $name", (c) => {
  const concerns = concernsFor(c);

  it("starts from at least one concern", () => {
    expect(concerns.length).toBeGreaterThan(0);
  });

  it("writes sentences that each cite an input rule and nothing foreign", async () => {
    const draft = await draftReturnNote(fakeTx(), { submissionId: "s1", concerns });
    const inputIds = new Set(concerns.map((x) => x.ruleId));
    const inputDollars = new Set(concerns.flatMap((x) => dollarFigures(`${x.label} ${x.detail ?? ""}`)));
    expect(draft.mode).toBe("fallback");
    expect(draft.sentences.length).toBeGreaterThan(0);
    for (const sentence of draft.sentences) {
      expect(sentence.ruleIds.length).toBeGreaterThan(0);
      for (const id of sentence.ruleIds) expect(inputIds.has(id)).toBe(true);
      for (const figure of dollarFigures(sentence.text)) expect(inputDollars.has(figure)).toBe(true);
    }
    for (const id of inputIds) expect(draft.sentences.some((s) => s.ruleIds.includes(id))).toBe(true);
  });

  it("keeps rule ids and contact details out of the organization text", async () => {
    const draft = await draftReturnNote(fakeTx(), { submissionId: "s1", concerns });
    expect(containsRuleId(draft.text)).toBe(false);
    expect(draft.text).not.toMatch(/@|Pat Example/);
  });
});

describe("[US-044] the analyst's own flag text stays out of the drafted note", () => {
  const flagged = {
    ...cases[4],
    flags: [
      {
        id: "f9",
        kind: "manual",
        note: "Youth age-group table was submitted blank, ask for the real counts. Contact alex@example.org or 718-555-0142.",
      },
    ],
  };
  const concerns = concernsFor(flagged);

  it("carries the flag note into the concern", () => {
    expect(concerns.find((c) => c.kind === "flag")?.detail).toBe(
      "Youth age-group table was submitted blank, ask for the real counts. Contact [email removed] or [phone removed].",
    );
  });

  it("tells the organization only that Council Finance has a question, without the flag text or contact details", async () => {
    const draft = await draftReturnNote(fakeTx(), { submissionId: "s1", concerns });
    expect(draft.mode).toBe("fallback");
    expect(draft.text).toContain("Council Finance has a question about this report. Please review it and respond.");
    expect(draft.text).not.toContain("age-group table was submitted blank");
    expect(draft.text).not.toMatch(/alex@|718-555|555-0142/);
  });

  it("falls back to the kind of flag when the analyst left no text", () => {
    const bare = concernsFor({ ...cases[4], flags: [{ id: "f8", kind: "manual", note: "  " }] }).find(
      (c) => c.kind === "flag",
    );
    expect(bare?.detail).toBeNull();
  });
});

describe("return note validation of model output", () => {
  const concerns = concernsFor(cases[1]);
  const id = concerns[0].ruleId;

  it("drops sentences that cite no rule, a foreign rule, a foreign amount or show a rule id", async () => {
    live.result = {
      output: {
        sentences: [
          { text: "Please correct the budget so the total equals the award.", rule_ids: [id] },
          { text: "Please explain the missing signature.", rule_ids: [] },
          { text: "Please fix the foreign rule.", rule_ids: ["ZZ-999"] },
          { text: "Please repay $5,000.00 right away.", rule_ids: [id] },
          { text: `Please see ${id} for details.`, rule_ids: [id] },
        ],
      },
      model: "test-model",
      tokensIn: 10,
      tokensOut: 10,
      costUsd: 0,
      latencyMs: 5,
    };
    const draft = await draftReturnNote(fakeTx(), { submissionId: "s1", concerns });
    expect(draft.mode).toBe("live");
    expect(draft.dropped).toBe(4);
    expect(draft.sentences.map((s) => s.text)).toEqual(["Please correct the budget so the total equals the award."]);
    expect(containsRuleId(draft.text)).toBe(false);
  });

  it("fills a concern the model skipped with the template sentence", async () => {
    live.result = {
      output: { sentences: [] },
      model: "test-model",
      tokensIn: 1,
      tokensOut: 1,
      costUsd: 0,
      latencyMs: 1,
    };
    const draft = await draftReturnNote(fakeTx(), { submissionId: "s1", concerns });
    expect(draft.sentences.length).toBe(concerns.length);
    expect(draft.aiActionId).toBe("ai-action-1");
  });

  it("skips the model and the log when the AI switch is off", async () => {
    const draft = await draftReturnNote(fakeTx(false), { submissionId: "s1", concerns });
    expect(draft.mode).toBe("fallback");
    expect(draft.aiActionId).toBeNull();
    expect(draft.sentences.length).toBeGreaterThan(0);
  });
});
