import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
let maria: string;
let orgId: string;
const created: string[] = [];

beforeAll(async () => {
  owner = await connect(ownerUrl());
  maria = await userId(owner, "maria");
  orgId = (await owner.query<{ org_id: string }>("SELECT org_id FROM app_user WHERE id = $1", [maria])).rows[0].org_id;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  if (created.length) await owner.query("DELETE FROM outbox WHERE id = ANY($1::uuid[])", [created]);
  await owner?.end();
});

async function queueRow(to = "maria@example.org", template = "submission_confirmation"): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    "INSERT INTO outbox (to_email, template, subject, body_text, org_id, created_by) VALUES ($1, $2, 'Report received: test', 'Full report body', $3, $4) RETURNING id",
    [to, template, orgId, maria]
  );
  created.push(rows[0].id);
  return rows[0].id;
}

async function state(id: string) {
  return (await owner.query("SELECT status, provider_id, sent_at, failure_reason, attempts FROM outbox WHERE id = $1", [id])).rows[0];
}

async function run() {
  const { dispatchFor } = await import("@/lib/outbox-dispatch");
  return dispatchFor(maria, { limit: 100 });
}

describe("[US-020][BR-014] outbox delivery", () => {
  it("records a message and never marks it sent when no transport is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    const id = await queueRow();
    expect((await state(id)).status).toBe("queued");
    await run();
    const row = await state(id);
    expect(row.status).toBe("recorded");
    expect(row.provider_id).toBeNull();
    expect(row.sent_at).toBeNull();
  });

  it("marks a message sent with the provider id and time when the provider accepts it", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fake");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.org");
    vi.stubEnv("EMAIL_ALLOWLIST", "");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "msg_fake_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const id = await queueRow();
    await run();
    const row = await state(id);
    expect(row.status).toBe("sent");
    expect(row.provider_id).toBe("msg_fake_1");
    expect(row.sent_at).not.toBeNull();
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ to: ["maria@example.org"], text: "Full report body" });
  });

  it("holds a message outside the allowlist", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fake");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.org");
    vi.stubEnv("EMAIL_ALLOWLIST", "@council.example");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const id = await queueRow();
    await run();
    expect((await state(id)).status).toBe("held");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a failed send and stops as failed after the third attempt", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fake");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.org");
    vi.stubEnv("EMAIL_ALLOWLIST", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "rate limited" }), { status: 429 })));
    const id = await queueRow();
    await run();
    expect(await state(id)).toMatchObject({ status: "queued", attempts: 1 });
    await run();
    expect(await state(id)).toMatchObject({ status: "queued", attempts: 2 });
    await run();
    const row = await state(id);
    expect(row).toMatchObject({ status: "failed", attempts: 3 });
    expect(row.failure_reason).toContain("429");
    await run();
    expect((await state(id)).attempts).toBe(3);
  });

  it("does not email password link messages and does not let a submitter see them", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fake");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.org");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const id = await queueRow("maria@example.org", "password_reset");
    await run();
    expect((await state(id)).status).toBe("queued");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the seeded history honest", async () => {
    const { rows } = await owner.query("SELECT count(*)::int AS n FROM outbox WHERE status = 'sent' AND provider_id IS NULL");
    expect(rows[0].n).toBe(0);
    await expect(owner.query("UPDATE outbox SET status = 'sent' WHERE id = $1", [created[0]])).rejects.toMatchObject({ code: "23514" });
  });
});

describe("[US-052] reminder emails go through the same delivery path", () => {
  it("delivers a queued reminder when a transport is configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_fake");
    vi.stubEnv("EMAIL_FROM", "no-reply@example.org");
    vi.stubEnv("EMAIL_ALLOWLIST", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "msg_fake_reminder" }), { status: 200 })));
    const id = await queueRow("maria@example.org", "reminder");
    await run();
    expect(await state(id)).toMatchObject({ status: "sent", provider_id: "msg_fake_reminder" });
  });
});
