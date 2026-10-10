import { describe, expect, it } from "vitest";
import { shouldRetrySave } from "@/lib/report/save-retry";

describe("[US-018] autosave retries only problems that can clear on their own", () => {
  it("retries a dropped connection, a server error and a signed out session", () => {
    expect(shouldRetrySave({ status: "error", message: "network" })).toBe(true);
    expect(shouldRetrySave({ status: "error", message: "Couldn't save. Keep this tab open.", retryable: true })).toBe(
      true,
    );
    expect(shouldRetrySave({ status: "signed_out" })).toBe(true);
  });

  it("does not retry a validation, schema or over-limit refusal", () => {
    expect(shouldRetrySave({ status: "error", message: "Check for very long text.", retryable: false })).toBe(false);
    expect(
      shouldRetrySave({ status: "error", message: "A budget can have at most 100 lines.", retryable: false }),
    ).toBe(false);
  });

  it("does not retry a stale or locked report", () => {
    expect(shouldRetrySave({ status: "stale", by: null, at: "2026-10-10T00:00:00Z" })).toBe(false);
    expect(shouldRetrySave({ status: "locked", message: "submitted" })).toBe(false);
  });
});
