import { describe, expect, it, vi } from "vitest";
import type { Concern } from "@/lib/finance/review/return-note-core";

vi.mock("server-only", () => ({}));

import { modelPayload } from "@/lib/ai/return-note";

const concerns: Concern[] = [
  { id: "US-029:a", ruleId: "US-029", kind: "rule", label: "Participants targeted this period", detail: null },
  {
    id: "BR-022:budget",
    ruleId: "BR-022",
    kind: "rule",
    label: "Budget",
    detail: "Total $91,750.00 vs award $90,000.00",
  },
];

describe("[US-044] what the return note model is sent", () => {
  it("leaves out the value when a concern has none, so the model cannot write null", () => {
    const sent = JSON.parse(modelPayload(concerns)) as { concerns: Record<string, unknown>[] };
    expect(sent.concerns[0]).toEqual({ rule_id: "US-029", field: "Participants targeted this period" });
    expect(JSON.stringify(sent)).not.toContain("null");
  });

  it("keeps the value when there is one", () => {
    const sent = JSON.parse(modelPayload(concerns)) as { concerns: Record<string, unknown>[] };
    expect(sent.concerns[1].value).toBe("Total $91,750.00 vs award $90,000.00");
  });
});
