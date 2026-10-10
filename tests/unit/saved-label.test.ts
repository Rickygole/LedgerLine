import { describe, expect, it } from "vitest";
import { savedAtLabel } from "@/lib/report/format";

describe("last saved label", () => {
  const today = "2026-10-09";

  it("shows only the time for a save made today in New York", () => {
    expect(savedAtLabel("2026-10-09T14:37:00Z", today)).toBe("10:37 AM");
  });

  it("includes the date without the year for an earlier day this year", () => {
    expect(savedAtLabel("2026-07-19T14:37:00Z", today)).toBe("Jul 19, 10:37 AM");
  });

  it("keeps the year for a save made in another year", () => {
    expect(savedAtLabel("2025-12-30T14:37:00Z", today)).toBe("Dec 30, 2025, 9:37 AM");
  });

  it("uses the New York day, not the UTC day", () => {
    expect(savedAtLabel("2026-10-10T02:30:00Z", "2026-10-09")).toBe("10:30 PM");
    expect(savedAtLabel("2026-10-10T02:30:00Z", "2026-10-10")).toBe("Oct 9, 10:30 PM");
  });
});
