import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";

vi.mock("server-only", () => ({}));

const callStructured = vi.fn();

vi.mock("@/lib/ai/model", async (original) => ({
  ...(await original<typeof import("@/lib/ai/model")>()),
  callStructured: (...args: unknown[]) => callStructured(...args),
}));

import { draftFormFromDocx } from "@/lib/ai/form-draft";

function fakeTx(aiEnabled: boolean | null): Tx {
  return {
    one: async (sql: string) => {
      if (sql.includes("app_setting")) return aiEnabled === null ? undefined : { value: aiEnabled };
      return { id: "11111111-1111-4111-8111-111111111111" };
    },
    query: async () => [],
  } as unknown as Tx;
}

const paragraphs = ["Food Pantry Report", "1. How many households did you serve this quarter?", "2. Describe your outreach work."];

describe("[AI-1] the AI switch covers form drafting", () => {
  beforeEach(() => callStructured.mockReset());

  it("never calls the model and drafts by rules when the switch is off", async () => {
    const result = await draftFormFromDocx({ tx: fakeTx(false), initiativeId: "i", paragraphs });
    expect(callStructured).not.toHaveBeenCalled();
    expect(result.mode).toBe("fallback");
  });

  it("calls the model when the switch is on", async () => {
    callStructured.mockResolvedValue(null);
    const result = await draftFormFromDocx({ tx: fakeTx(true), initiativeId: "i", paragraphs });
    expect(callStructured).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("fallback");
  });

  it("treats a missing setting as on, like note drafting", async () => {
    callStructured.mockResolvedValue(null);
    await draftFormFromDocx({ tx: fakeTx(null), initiativeId: "i", paragraphs });
    expect(callStructured).toHaveBeenCalledTimes(1);
  });
});
