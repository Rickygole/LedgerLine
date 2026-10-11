import { describe, expect, it } from "vitest";
import { retirementText } from "@/lib/lifecycle/retirement";

const link = { kind: "retired", fiscal_year_id: "FY27", other_id: null } as never;

describe("[US-002] the retired header tells how the initiative was retired", () => {
  it("names the date, the person and the reason for a mid-year retirement", () => {
    expect(retirementText(link, { on: "2026-10-09", reason: "Funding ended", byName: "Priya Raman" })).toBe(
      "Retired on Oct 9, 2026 by Priya Raman. Reason: Funding ended",
    );
  });

  it("keeps the rollover wording for a rollover retirement", () => {
    expect(retirementText(link, { on: null, reason: null, byName: null })).toBe("Retired at the rollover into FY27");
    expect(retirementText(link)).toBe("Retired at the rollover into FY27");
  });
});
