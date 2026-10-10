import { describe, expect, it } from "vitest";
import { longDate, renderSubject } from "@/lib/lifecycle/reminders";

describe("reminder subjects", () => {
  it("fills the period and due date the way the email will read", () => {
    expect(
      renderSubject("Upcoming: {period} report due {due_date}", { label: "FY26 Year-End", dueOn: "2026-09-30" }),
    ).toBe("Upcoming: FY26 Year-End report due September 30, 2026");
  });

  it("leaves no raw tokens behind", () => {
    const subject = renderSubject("{organization}: {initiative} {period} {due_date}", {
      label: "FY26 Mid-Year",
      dueOn: "2026-03-31",
    });
    expect(subject).not.toMatch(/[{}]/);
  });

  it("formats long dates without shifting the day", () => {
    expect(longDate("2026-01-01")).toBe("January 1, 2026");
  });
});
