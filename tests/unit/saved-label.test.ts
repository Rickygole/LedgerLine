import { describe, expect, it } from "vitest";
import { savedAtLabel } from "@/lib/report/format";

describe("[US-018] last saved label", () => {
  const now = new Date("2026-10-09T16:00:00Z");

  it("shows only the time for a save made today in New York", () => {
    expect(savedAtLabel("2026-10-09T14:37:00Z", now)).toBe("10:37 AM");
  });

  it("includes the date for an earlier day", () => {
    expect(savedAtLabel("2026-07-19T14:37:00Z", now)).toBe("Jul 19, 2026, 10:37 AM");
  });

  it("uses the New York day, not the UTC day", () => {
    expect(savedAtLabel("2026-10-10T02:30:00Z", new Date("2026-10-10T03:00:00Z"))).toBe("10:30 PM");
    expect(savedAtLabel("2026-10-10T02:30:00Z", now)).toBe("10:30 PM");
    expect(savedAtLabel("2026-10-10T02:30:00Z", new Date("2026-10-10T16:00:00Z"))).toBe("Oct 9, 2026, 10:30 PM");
  });
});
