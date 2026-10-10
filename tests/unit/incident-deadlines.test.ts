import { describe, expect, it } from "vitest";
import { incidentStatus, notificationDeadline, notifyDueAt, remediationDeadline, remediationDueAt } from "@/lib/ops/incidents";

const detected = "2026-10-05T12:00:00Z";
const hours = (n: number) => new Date(new Date(detected).getTime() + n * 3_600_000);

describe("[US-058][BR-025] breach notification deadline indicator", () => {
  it("sets the notice due 24 hours after detection and the remediation report due 7 days after", () => {
    expect(notifyDueAt(detected).toISOString()).toBe("2026-10-06T12:00:00.000Z");
    expect(remediationDueAt(detected).toISOString()).toBe("2026-10-12T12:00:00.000Z");
  });

  it("marks a notice sent inside 24 hours as on time and later as late, with the margin", () => {
    expect(notificationDeadline({ detectedAt: detected, notifiedAt: hours(1), now: hours(50) })).toMatchObject({ state: "met", minutes: 23 * 60 });
    expect(notificationDeadline({ detectedAt: detected, notifiedAt: hours(24), now: hours(50) }).state).toBe("met");
    expect(notificationDeadline({ detectedAt: detected, notifiedAt: hours(30), now: hours(50) })).toMatchObject({ state: "late", minutes: 6 * 60 });
  });

  it("counts down to the notice deadline when nobody has been notified yet", () => {
    expect(notificationDeadline({ detectedAt: detected, notifiedAt: null, now: hours(2) })).toMatchObject({ state: "on_track", minutes: 22 * 60 });
    expect(notificationDeadline({ detectedAt: detected, notifiedAt: null, now: hours(21) })).toMatchObject({ state: "due_soon", minutes: 3 * 60 });
    expect(notificationDeadline({ detectedAt: detected, notifiedAt: null, now: hours(26) })).toMatchObject({ state: "overdue", minutes: 2 * 60 });
  });

  it("tracks the remediation report against its 7 day deadline", () => {
    expect(remediationDeadline({ detectedAt: detected, completedOn: null, now: hours(24) }).state).toBe("on_track");
    expect(remediationDeadline({ detectedAt: detected, completedOn: null, now: hours(24 * 6 + 12) }).state).toBe("due_soon");
    expect(remediationDeadline({ detectedAt: detected, completedOn: null, now: hours(24 * 8) }).state).toBe("overdue");
    expect(remediationDeadline({ detectedAt: detected, completedOn: "2026-10-10", now: hours(24 * 9) }).state).toBe("met");
    expect(remediationDeadline({ detectedAt: detected, completedOn: "2026-10-12", now: hours(24 * 9) }).state).toBe("met");
    expect(remediationDeadline({ detectedAt: detected, completedOn: "2026-10-14", now: hours(24 * 9) }).state).toBe("late");
  });

  it("derives status from the latest remediation report", () => {
    expect(incidentStatus(null)).toBe("open");
    expect(incidentStatus({ completed_on: null })).toBe("remediating");
    expect(incidentStatus({ completed_on: "2026-10-10" })).toBe("closed");
  });
});
