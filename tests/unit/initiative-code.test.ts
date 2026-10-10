import { describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";

vi.mock("server-only", () => ({}));

import { nextInitiativeCode } from "@/lib/finance/admin/initiatives";

const tx = (next: number | null) => ({ one: async () => (next === null ? null : { next }) }) as unknown as Tx;

describe("[US-001] a new initiative gets the next serial under the fiscal year", () => {
  it("continues the serial across fiscal years and carries the year of the new initiative", async () => {
    expect(await nextInitiativeCode(tx(176), "FY27")).toBe("CI-27-176");
    expect(await nextInitiativeCode(tx(9), "FY28")).toBe("CI-28-009");
  });

  it("starts at 001 when no code has been issued", async () => {
    expect(await nextInitiativeCode(tx(null), "FY27")).toBe("CI-27-001");
  });
});
