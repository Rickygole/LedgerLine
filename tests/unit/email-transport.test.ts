import { describe, expect, it, vi } from "vitest";
import { allowed, heldReminderReason, redirectedMessage, sendEmail, transportFrom } from "@/lib/email";
import { dispatch, type Claimed, type OutboxStore } from "@/lib/outbox-dispatch";

const env = { RESEND_API_KEY: "re_test", EMAIL_FROM: "LedgerLine <no-reply@example.org>" };
const message = { to: "maria@example.org", subject: "Report received", text: "Body" };

function reply(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch;
}

describe("[US-020][BR-014] the email transport", () => {
  it("is off without a key and a sender", () => {
    expect(transportFrom({})).toBeNull();
    expect(transportFrom({ RESEND_API_KEY: "re_test" })).toBeNull();
    expect(transportFrom({ EMAIL_FROM: "a@b.org" })).toBeNull();
    expect(transportFrom(env)).not.toBeNull();
  });

  it("sends through the provider and returns its message id", async () => {
    const fetchImpl = reply(200, { id: "msg_123" });
    const result = await sendEmail(transportFrom(env)!, message, fetchImpl);
    expect(result).toEqual({ status: "sent", providerId: "msg_123", deliveredTo: "maria@example.org" });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: env.EMAIL_FROM,
      to: ["maria@example.org"],
      subject: "Report received",
      text: "Body",
    });
  });

  it("reports a provider error as failed with a short reason", async () => {
    const result = await sendEmail(
      transportFrom(env)!,
      message,
      reply(422, { message: "The from address is not verified" }),
    );
    expect(result).toEqual({ status: "failed", reason: "Provider returned 422: The from address is not verified" });
  });

  it("reports an unreachable provider as failed", async () => {
    const result = await sendEmail(
      transportFrom(env)!,
      message,
      vi.fn(async () => Promise.reject(new Error("socket hang up"))) as unknown as typeof fetch,
    );
    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.reason).toContain("socket hang up");
  });

  it("fails an answer that carries no message id instead of claiming it was sent", async () => {
    expect((await sendEmail(transportFrom(env)!, message, reply(200, {}))).status).toBe("failed");
  });

  it("holds a recipient outside the allowlist without calling the provider", async () => {
    const fetchImpl = reply(200, { id: "msg_1" });
    const transport = transportFrom({ ...env, EMAIL_ALLOWLIST: "other@example.org, @council.example" })!;
    expect(await sendEmail(transport, message, fetchImpl)).toEqual({ status: "held" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(allowed(transport, "OTHER@example.org")).toBe(true);
    expect(allowed(transport, "analyst@council.example")).toBe(true);
    expect(allowed(transport, "analyst@evil-council.example")).toBe(false);
  });
});

function fakeStore(rows: Claimed[], limitOfAttempts = 3) {
  const state = new Map(
    rows.map((r) => [
      r.id,
      { ...r, status: "sending" as string, deliveredTo: null as string | null, reason: null as string | null },
    ]),
  );
  const store: OutboxStore = {
    claim: async () => rows,
    finish: async (id, status, _providerId, reason, deliveredTo) => {
      const row = state.get(id)!;
      row.deliveredTo = status === "sent" ? (deliveredTo ?? null) : null;
      row.reason = reason ?? null;
      const next = status === "failed" && row.attempts < limitOfAttempts ? "queued" : status;
      row.status = next;
      return next;
    },
  };
  return { store, state };
}

const row = (id: string, attempts = 1, template = "submission_confirmation"): Claimed => ({
  id,
  to_email: "maria@example.org",
  template,
  subject: "S",
  body_text: "B",
  attempts,
});

describe("[US-020][BR-014] the outbox dispatcher", () => {
  const transport = transportFrom(env)!;

  it("records every message when no transport is configured", async () => {
    const { store, state } = fakeStore([row("a")]);
    const summary = await dispatch(store, null);
    expect(summary).toMatchObject({ recorded: 1, sent: 0 });
    expect(state.get("a")!.status).toBe("recorded");
  });

  it("requeues a failed send and gives up after the third attempt", async () => {
    const first = fakeStore([row("c", 1)]);
    expect(
      await dispatch(first.store, transport, { send: async () => ({ status: "failed", reason: "boom" }) }),
    ).toMatchObject({ retry: 1, failed: 0 });
    expect(first.state.get("c")!.status).toBe("queued");
    const last = fakeStore([row("d", 3)]);
    expect(
      await dispatch(last.store, transport, { send: async () => ({ status: "failed", reason: "boom" }) }),
    ).toMatchObject({ retry: 0, failed: 1 });
    expect(last.state.get("d")!.status).toBe("failed");
  });

  it("counts sent and held results and survives a throwing sender", async () => {
    const results = [
      { status: "sent", providerId: "m1", deliveredTo: "maria@example.org" },
      { status: "held" },
    ] as const;
    let call = 0;
    const { store, state } = fakeStore([row("a"), row("b")]);
    const summary = await dispatch(store, transport, { send: async () => results[call++] });
    expect(summary).toMatchObject({ sent: 1, held: 1 });
    expect(state.get("a")!.status).toBe("sent");
    expect(state.get("b")!.status).toBe("held");
    const thrown = fakeStore([row("z")]);
    expect(
      await dispatch(thrown.store, transport, { send: async () => Promise.reject(new Error("down")) }),
    ).toMatchObject({ retry: 1 });
  });

  it("never emails a password link template", async () => {
    const send = vi.fn();
    const { store, state } = fakeStore([row("p", 1, "password_reset")]);
    await dispatch(store, transport, { send });
    expect(send).not.toHaveBeenCalled();
    expect(state.get("p")!.status).toBe("recorded");
  });
});

describe("[US-020][BR-014] the review inbox", () => {
  const redirectEnv = { ...env, EMAIL_REDIRECT_TO: "owner@example.com" };
  const redirect = transportFrom(redirectEnv)!;

  it("reads the redirect address and the reminder limit", () => {
    expect(redirect.redirectTo).toBe("owner@example.com");
    expect(redirect.reminderLimit).toBe(3);
    expect(transportFrom({ ...redirectEnv, EMAIL_REDIRECT_REMINDER_LIMIT: "5" })!.reminderLimit).toBe(5);
    expect(transportFrom({ ...redirectEnv, EMAIL_REDIRECT_REMINDER_LIMIT: "x" })!.reminderLimit).toBe(3);
    expect(transportFrom(env)!.redirectTo).toBeNull();
  });

  it("turns delivery off when the redirect address is not an address", () => {
    expect(transportFrom({ ...env, EMAIL_REDIRECT_TO: "not an address" })).toBeNull();
  });

  it("sends to the review inbox with the intended address in the first line and the subject unchanged", async () => {
    const fetchImpl = reply(200, { id: "msg_9" });
    const result = await sendEmail(redirect, message, fetchImpl);
    expect(result).toEqual({ status: "sent", providerId: "msg_9", deliveredTo: "owner@example.com" });
    const body = JSON.parse(
      ((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.to).toEqual(["owner@example.com"]);
    expect(body.subject).toBe("Report received");
    expect(body.text.split("\n")[0]).toBe("Sent to the review inbox. Intended for: maria@example.org");
    expect(body.text.endsWith("Body")).toBe(true);
    expect(redirectedMessage(transportFrom(env)!, message)).toEqual(message);
  });

  it("applies the allowlist to the original recipient and delivers by default", async () => {
    const fetchImpl = reply(200, { id: "msg_1" });
    const listed = transportFrom({ ...redirectEnv, EMAIL_ALLOWLIST: "@council.example" })!;
    expect(await sendEmail(listed, message, fetchImpl)).toEqual({ status: "held" });
    expect(fetchImpl).not.toHaveBeenCalled();
    const ok = await sendEmail(listed, { ...message, to: "analyst@council.example" }, fetchImpl);
    expect(ok.status).toBe("sent");
    expect((await sendEmail(redirect, message, reply(200, { id: "x" }))).status).toBe("sent");
  });

  it("delivers only the reminder limit per run and holds the rest with a reason", async () => {
    const rows = ["r1", "r2", "r3", "r4", "r5"].map((id) => row(id, 1, "reminder"));
    const { store, state } = fakeStore(rows);
    const send = vi.fn(async () => ({ status: "sent", providerId: "m", deliveredTo: "owner@example.com" }) as const);
    const summary = await dispatch(store, redirect, { send });
    expect(summary).toMatchObject({ sent: 3, held: 2 });
    expect(send).toHaveBeenCalledTimes(3);
    expect(state.get("r4")!.status).toBe("held");
    expect(state.get("r4")!.reason).toBe("Held: only 3 reminders per run go to the review inbox.");
    expect(heldReminderReason(redirect)).toBe(state.get("r5")!.reason);
    expect(state.get("r1")!.deliveredTo).toBe("owner@example.com");
  });

  it("shares one reminder budget across rounds and never caps transactional mail", async () => {
    const budget = { used: 0 };
    const send = vi.fn(async (_t, m) => ({ status: "sent", providerId: "m", deliveredTo: m.to }) as const);
    await dispatch(fakeStore([row("a", 1, "reminder"), row("b", 1, "reminder")]).store, redirect, { send, budget });
    const second = fakeStore([
      row("c", 1, "reminder"),
      row("d", 1, "reminder"),
      row("e", 1, "submission_confirmation"),
      row("f", 1, "update_requested"),
      row("g", 1, "acceptance_notice"),
    ]);
    expect(await dispatch(second.store, redirect, { send, budget })).toMatchObject({ sent: 4, held: 1 });
    expect(second.state.get("d")!.status).toBe("held");
    expect(second.state.get("g")!.status).toBe("sent");
  });

  it("does not cap reminders when there is no review inbox", async () => {
    const rows = ["a", "b", "c", "d", "e"].map((id) => row(id, 1, "reminder"));
    const send = vi.fn(async (_t, m) => ({ status: "sent", providerId: "m", deliveredTo: m.to }) as const);
    expect(await dispatch(fakeStore(rows).store, transport(), { send })).toMatchObject({ sent: 5, held: 0 });
  });
});

function transport() {
  return transportFrom(env)!;
}
