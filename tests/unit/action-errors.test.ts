import { describe, expect, it } from "vitest";
import { dbErrorMessage, failure, success } from "@/lib/actions";
import { REVIEW_ERRORS, STALE_MESSAGE } from "@/lib/finance/review/errors";
import { formatActionErrorLog } from "@/lib/ops/log";

const pg = (code: string, message = "", extra: Record<string, unknown> = {}) => Object.assign(new Error(message), { code, ...extra });

describe("[US-062] one error mapper for every server action", () => {
  it("maps database codes to plain sentences and falls back without leaking the raw error", () => {
    expect(dbErrorMessage(pg("40001"))).toBe("Someone else changed this record first. Reload the page and try again.");
    expect(dbErrorMessage(pg("23505", "duplicate key", { constraint: "initiative_name_year_idx" }))).toMatch(/initiative with that name already exists/);
    const unknown = dbErrorMessage(new Error("connection refused 10.0.0.4"));
    expect(unknown).toMatch(/^Something went wrong and nothing was saved/);
    expect(unknown).not.toContain("10.0.0.4");
  });

  it("applies area specific messages before the code defaults", () => {
    expect(dbErrorMessage(pg("P0001", "request is closed"), { messages: { "request is closed": "This request is closed." } })).toBe("This request is closed.");
    expect(dbErrorMessage(pg("P0001", "Resolve blocking flags first"), REVIEW_ERRORS)).toMatch(/^Resolve the open budget/);
    expect(dbErrorMessage(pg("40001"), REVIEW_ERRORS)).toBe(STALE_MESSAGE);
    expect(dbErrorMessage(pg("23514", "something else"), REVIEW_ERRORS)).toBe("That change is not allowed for this report right now.");
  });

  it("returns a success or failure result with a timestamp", () => {
    expect(success("Saved.").ok).toBe("Saved.");
    expect(failure("No.", { values: { a: "b" } })).toMatchObject({ error: "No.", values: { a: "b" } });
    expect(typeof failure("No.").at).toBe("number");
  });

  it("logs the real error as one JSON line with the request id", () => {
    const line = formatActionErrorLog("save_draft_failed", pg("57P01", "terminating connection"), "req-1", new Date("2026-10-10T12:00:00Z"));
    expect(JSON.parse(line)).toEqual({ level: "error", event: "save_draft_failed", at: "2026-10-10T12:00:00.000Z", requestId: "req-1", code: "57P01", message: "terminating connection" });
    expect(line.includes("\n")).toBe(false);
  });
});
