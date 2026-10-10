import { describe, expect, it } from "vitest";
import { buildAiInput, buildConcerns, noteText, templateSentences } from "@/lib/finance/review/return-note-core";

const manual = {
  id: "f1",
  kind: "manual",
  reason: "manual",
  note: "Director is under investigation. Call 718 555 0142 before the board meets.",
  createdAt: "2026-10-09T12:00:00Z",
} as never;

function concerns() {
  return buildConcerns({
    definition: null,
    issues: [],
    budget: [],
    award: 90000,
    status: "submitted",
    answers: {},
    openFlags: [manual],
  });
}

describe("[US-044] internal flag notes stay internal", () => {
  it("keeps the analyst's note on the concern but never writes it into the note to the organization", () => {
    const list = concerns();
    expect(list.find((c) => c.kind === "flag")?.detail).toContain("under investigation");
    const text = noteText(templateSentences(list));
    expect(text).toBe("Council Finance has a question about this report. Please review it and respond.");
    expect(text).not.toContain("investigation");
  });

  it("does not send the flag note to the drafting model", () => {
    const sent = JSON.stringify(buildAiInput(concerns()));
    expect(sent).not.toContain("investigation");
    expect(sent).not.toContain("555");
  });
});
