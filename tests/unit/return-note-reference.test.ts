import { describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";
import { PRESET_CONCERNS } from "@/lib/finance/review/return-note-core";

vi.mock("server-only", () => ({}));

const live = vi.hoisted(() => ({ output: null as unknown }));

vi.mock("@/lib/ai/model", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/model")>();
  return { ...original, callStructured: vi.fn(async () => ({ output: live.output, model: "m (local)", tokensIn: 1, tokensOut: 1, costUsd: 0, latencyMs: 1 })) };
});

import { draftReturnNote, withoutRuleReferences } from "@/lib/ai/return-note";

const tx = {
  async query() {
    return [];
  },
  async one<T>(sql: string) {
    if (sql.includes("app_setting")) return { value: true } as T;
    return { id: "ai-action-1" } as T;
  },
} as unknown as Tx;

describe("[US-044] a model sentence that names a rule never reaches the organization", () => {
  it("removes sentences that mention a rule, even with a mangled id", () => {
    const { output, removed } = withoutRuleReferences({
      sentences: [
        { text: "Please verify the participant counts as per rule PR-0:02.", rule_ids: ["PR-002"] },
        { text: "See PR 002 for details PR-2.", rule_ids: ["PR-002"] },
        { text: "Please confirm the FY26 participant counts.", rule_ids: ["PR-002"] },
      ],
    });
    expect(removed).toBe(2);
    expect((output as { sentences: { text: string }[] }).sentences.map((s) => s.text)).toEqual(["Please confirm the FY26 participant counts."]);
  });

  it("covers the concern from the template instead", async () => {
    live.output = { sentences: [{ text: "Please verify the participant counts as per rule PR-0:02.", rule_ids: ["PR-002"] }] };
    const draft = await draftReturnNote(tx, { submissionId: "s1", concerns: PRESET_CONCERNS.filter((c) => c.ruleId === "PR-002") });
    expect(draft.text).not.toMatch(/PR-0|rule/i);
    expect(draft.sentences.some((s) => s.ruleIds.includes("PR-002"))).toBe(true);
    expect(draft.dropped).toBe(1);
    expect(draft.filled).toBe(1);
  });
});
