import { describe, expect, it } from "vitest";
import { savedAtLabel } from "@/lib/report/format";

describe("[US-018] last saved label", () => {
  const today = "2026-10-09";

  it("shows only the time for a save made today in New York", () => {
    expect(savedAtLabel("2026-10-09T14:37:00Z", today)).toBe("10:37 AM");
  });

  it("includes the date for an earlier day", () => {
    expect(savedAtLabel("2026-07-19T14:37:00Z", today)).toBe("Jul 19, 2026, 10:37 AM");
  });

  it("uses the New York day, not the UTC day", () => {
    expect(savedAtLabel("2026-10-10T02:30:00Z", "2026-10-09")).toBe("10:30 PM");
    expect(savedAtLabel("2026-10-10T02:30:00Z", "2026-10-10")).toBe("Oct 9, 2026, 10:30 PM");
  });
});
