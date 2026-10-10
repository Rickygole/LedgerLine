import { describe, expect, it, vi } from "vitest";
import { allowed, sendEmail, transportFrom } from "@/lib/email";
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
    expect(result).toEqual({ status: "sent", providerId: "msg_123" });
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
  const state = new Map(rows.map((r) => [r.id, { ...r, status: "sending" as string }]));
  const store: OutboxStore = {
    claim: async () => rows,
    finish: async (id, status) => {
      const row = state.get(id)!;
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
    const results = [{ status: "sent", providerId: "m1" }, { status: "held" }] as const;
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
