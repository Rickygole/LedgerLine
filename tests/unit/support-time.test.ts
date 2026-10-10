import { describe, expect, it } from "vitest";
import { ageMinutes, dueAt, formatDuration, metTarget, responseMinutes, supportState, targetSummary } from "@/lib/ops/support";

const created = "2026-10-06T14:00:00Z";
const at = (hours: number, minutes = 0) => new Date(new Date(created).getTime() + hours * 3_600_000 + minutes * 60_000);

describe("[US-063][BR-029] support response is measured against a 24 hour target", () => {
  it("sets the due time exactly 24 hours after the request", () => {
    expect(dueAt(created).toISOString()).toBe("2026-10-07T14:00:00.000Z");
  });

  it("is open inside the target, overdue after it, with no reply", () => {
    expect(supportState({ createdAt: created, firstResponseAt: null, now: at(0) })).toBe("open");
    expect(supportState({ createdAt: created, firstResponseAt: null, now: at(24) })).toBe("open");
    expect(supportState({ createdAt: created, firstResponseAt: null, now: at(24, 1) })).toBe("overdue");
    expect(supportState({ createdAt: created, firstResponseAt: null, now: at(100) })).toBe("overdue");
  });

  it("is responded once a first reply exists, even a late one, and closed once closed", () => {
    expect(supportState({ createdAt: created, firstResponseAt: at(3), now: at(5) })).toBe("responded");
    expect(supportState({ createdAt: created, firstResponseAt: at(40), now: at(60) })).toBe("responded");
    expect(supportState({ createdAt: created, firstResponseAt: at(3), closedAt: at(4), now: at(5) })).toBe("closed");
  });

  it("computes the first response time in minutes and whether it met the target", () => {
    expect(responseMinutes(created, null)).toBeNull();
    expect(responseMinutes(created, at(2, 30))).toBe(150);
    expect(metTarget(created, at(23, 59))).toBe(true);
    expect(metTarget(created, at(24))).toBe(true);
    expect(metTarget(created, at(24, 1))).toBe(false);
    expect(metTarget(created, null)).toBeNull();
  });

  it("summarizes replies met within the target and the median first reply", () => {
    const rows = [
      { createdAt: created, firstResponseAt: at(1).toISOString() },
      { createdAt: created, firstResponseAt: at(3).toISOString() },
      { createdAt: created, firstResponseAt: at(30).toISOString() },
      { createdAt: created, firstResponseAt: null },
    ];
    expect(targetSummary(rows)).toEqual({ responded: 3, metTarget: 2, medianMinutes: 180 });
    expect(targetSummary([])).toEqual({ responded: 0, metTarget: 0, medianMinutes: null });
  });

  it("states age and durations in plain words", () => {
    expect(ageMinutes(created, at(2))).toBe(120);
    expect(formatDuration(1)).toBe("1 minute");
    expect(formatDuration(45)).toBe("45 minutes");
    expect(formatDuration(120)).toBe("2 hours");
    expect(formatDuration(150)).toBe("2 h 30 min");
    expect(formatDuration(60 * 72)).toBe("3 days");
  });
});
