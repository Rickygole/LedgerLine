import { describe, expect, it } from "vitest";
import { sendNowSummary } from "@/lib/lifecycle/reminders";

describe("[US-052] send now states who will get the reminders before queueing", () => {
  it("counts organizations and emails", () => {
    expect(sendNowSummary(61, 61, "Oct 14, 2026")).toBe("This will add 61 emails to the outbox for 61 organizations for Oct 14, 2026.");
  });

  it("uses the singular for one", () => {
    expect(sendNowSummary(1, 1, "Oct 14, 2026")).toBe("This will add 1 email to the outbox for 1 organization for Oct 14, 2026.");
  });
});
