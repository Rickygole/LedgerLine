import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, asUser, connect, errorCode as plainErrorCode, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let winston: string;
let daniel: string;
let grace: string;
let maria: string;
let james: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  winston = await userId(owner, "winston.kellerman");
  daniel = await userId(owner, "daniel.cho");
  grace = await userId(owner, "grace.chen");
  maria = await userId(owner, "maria.santos");
  james = await userId(owner, "james.okafor");
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function ask(who: string, subject: string): Promise<string> {
  const row = await app.query("SELECT app.create_support_request('report', $1, 'The totals do not match.') AS id", [
    subject,
  ]);
  void who;
  return row.rows[0].id as string;
}

async function errorCode(fn: () => Promise<unknown>): Promise<string | null> {
  await app.query("SAVEPOINT attempt");
  try {
    await fn();
    await app.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await app.query("ROLLBACK TO SAVEPOINT attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

async function as(id: string) {
  await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id })]);
}

describe("[US-061][US-063][BR-029] help requests and the 24 hour response target", () => {
  it("lets every signed-in role send a request and records an audit event", async () => {
    await asUser(app, null, async () => {
      const ids: string[] = [];
      for (const who of [maria, grace, daniel, priya]) {
        await as(who);
        const id = await ask(who, `Help from ${who.slice(0, 4)}`);
        ids.push(id);
        const stored = (await app.query("SELECT requester, reference, state FROM support_queue WHERE id = $1", [id]))
          .rows[0];
        expect(stored.requester).toBe(who);
        expect(stored.reference).toMatch(/^SR-\d{5}$/);
        expect(stored.state).toBe("open");
      }
      await as(priya);
      const audit = (
        await app.query(
          "SELECT count(*)::int AS n FROM audit_event WHERE entity = 'support_request' AND entity_id = ANY($1::text[]) AND action = 'support_request_created'",
          [ids],
        )
      ).rows[0].n;
      expect(audit).toBe(4);
    });
  });

  it("shows each person only their own requests, and every request to an administrator", async () => {
    await asUser(app, null, async () => {
      await as(maria);
      const mine = await ask(maria, "Maria question");
      await as(james);
      const theirs = await ask(james, "James question");
      await as(daniel);
      const analystOwn = await ask(daniel, "Daniel question");

      await as(maria);
      const seenByMaria = (
        await app.query("SELECT id FROM support_request WHERE id = ANY($1::uuid[])", [[mine, theirs, analystOwn]])
      ).rows.map((r) => r.id);
      expect(seenByMaria).toEqual([mine]);
      expect(
        (await app.query("SELECT count(*)::int AS n FROM support_message WHERE request_id = $1", [theirs])).rows[0].n,
      ).toBe(0);
      expect(
        await errorCode(() => app.query("SELECT app.reply_support_request($1, 'Let me read this')", [theirs])),
      ).toBe("42501");

      await as(daniel);
      const seenByAnalyst = (
        await app.query("SELECT id FROM support_request WHERE id = ANY($1::uuid[])", [[mine, theirs, analystOwn]])
      ).rows.map((r) => r.id);
      expect(seenByAnalyst).toEqual([analystOwn]);

      await as(priya);
      const seenByAdmin = (
        await app.query("SELECT id FROM support_request WHERE id = ANY($1::uuid[])", [[mine, theirs, analystOwn]])
      ).rows
        .map((r) => r.id)
        .sort();
      expect(seenByAdmin).toEqual([mine, theirs, analystOwn].sort());
    });
  });

  it("records the first response time once and never overwrites it", async () => {
    await asUser(app, null, async () => {
      await as(maria);
      const id = await ask(maria, "Locked out");
      await as(priya);
      await app.query("SELECT app.reply_support_request($1, 'We have unlocked your account.')", [id]);
      const first = (
        await app.query(
          "SELECT first_response_at, first_responder, state, response_minutes, met_target FROM support_queue WHERE id = $1",
          [id],
        )
      ).rows[0];
      expect(first.first_responder).toBe(priya);
      expect(first.state).toBe("responded");
      expect(first.response_minutes).toBe(0);
      expect(first.met_target).toBe(true);

      await as(winston);
      await app.query("SELECT app.reply_support_request($1, 'Following up with a tip.')", [id]);
      const second = (
        await app.query("SELECT first_response_at, first_responder FROM support_queue WHERE id = $1", [id])
      ).rows[0];
      expect(second.first_response_at).toEqual(first.first_response_at);
      expect(second.first_responder).toBe(priya);

      await as(maria);
      await app.query("SELECT app.reply_support_request($1, 'Thank you, it works now.')", [id]);
      const messages = (
        await app.query("SELECT from_staff FROM support_message WHERE request_id = $1 ORDER BY id", [id])
      ).rows.map((r) => r.from_staff);
      expect(messages).toEqual([false, true, true, false]);
      const after = (await app.query("SELECT first_responder FROM support_queue WHERE id = $1", [id])).rows[0];
      expect(after.first_responder).toBe(priya);
    });
  });

  it("measures overdue, responded late and responded in time from the stored timestamps", async () => {
    await owner.query("BEGIN");
    try {
      const insert = async (subject: string, ageHours: number, replyAfterHours: number | null) => {
        const { rows } = await owner.query(
          `INSERT INTO support_request (requester, category, subject, body, created_at, first_response_at, first_responder)
           VALUES ($1, 'other', $2, 'Details', now() - make_interval(hours => $3), CASE WHEN $4::numeric IS NULL THEN NULL ELSE now() - make_interval(hours => $3) + make_interval(mins => round($4::numeric * 60)::int) END, CASE WHEN $4::numeric IS NULL THEN NULL ELSE $5::uuid END)
           RETURNING id`,
          [maria, subject, ageHours, replyAfterHours, priya],
        );
        return rows[0].id as string;
      };
      const fresh = await insert("fresh", 2, null);
      const stale = await insert("stale", 25, null);
      const quick = await insert("quick", 30, 4);
      const slow = await insert("slow", 60, 30);
      const state = async (id: string) =>
        (await owner.query("SELECT state, response_minutes, met_target FROM support_queue WHERE id = $1", [id]))
          .rows[0];
      expect(await state(fresh)).toEqual({ state: "open", response_minutes: null, met_target: null });
      expect(await state(stale)).toEqual({ state: "overdue", response_minutes: null, met_target: null });
      expect(await state(quick)).toEqual({ state: "responded", response_minutes: 240, met_target: true });
      expect(await state(slow)).toEqual({ state: "responded", response_minutes: 1800, met_target: false });
    } finally {
      await owner.query("ROLLBACK");
    }
  });

  it("queues the reply to the requester through the outbox and lets only an administrator reply as support or close", async () => {
    await asUser(app, null, async () => {
      await as(maria);
      const id = await ask(maria, "Which browser");
      await as(daniel);
      expect(await errorCode(() => app.query("SELECT app.close_support_request($1)", [id]))).toBe("42501");
      await as(priya);
      expect(await errorCode(() => app.query("SELECT app.close_support_request($1)", [id]))).toBe("23514");
      await app.query("SELECT app.reply_support_request($1, 'Use a current browser.')", [id]);
      const mail = (
        await app.query(
          "SELECT to_email, template FROM outbox WHERE template = 'support_response' AND subject LIKE '%' || (SELECT reference FROM support_request WHERE id = $1) || '%'",
          [id],
        )
      ).rows;
      expect(mail).toEqual([{ to_email: "maria.santos@motthavenyouth.example.org", template: "support_response" }]);
      await app.query("SELECT app.close_support_request($1)", [id]);
      expect((await app.query("SELECT state FROM support_queue WHERE id = $1", [id])).rows[0].state).toBe("closed");
      await as(maria);
      expect(await errorCode(() => app.query("SELECT app.reply_support_request($1, 'More')", [id]))).toBe("23514");
    });
  });

  it("rejects empty or oversized requests and keeps messages append only", async () => {
    await asUser(app, null, async () => {
      await as(maria);
      expect(await errorCode(() => app.query("SELECT app.create_support_request('report', '   ', 'Body')"))).toBe(
        "23514",
      );
      expect(
        await errorCode(() =>
          app.query("SELECT app.create_support_request('report', 'Subject', $1)", ["x".repeat(4001)]),
        ),
      ).toBe("23514");
      expect(await errorCode(() => app.query("SELECT app.create_support_request('nonsense', 'Subject', 'Body')"))).toBe(
        "23514",
      );
    });
    const message = (await owner.query("SELECT id FROM support_message LIMIT 1")).rows[0].id;
    expect(
      await plainErrorCode(() => owner.query("UPDATE support_message SET body = 'changed' WHERE id = $1", [message])),
    ).toBe("42501");
    expect(await plainErrorCode(() => owner.query("DELETE FROM support_message WHERE id = $1", [message]))).toBe(
      "42501",
    );
  });
});

describe("[US-061][US-063] a requester can read the support reply", () => {
  it("returns the staff message to the requester even though the requester cannot read the staff account", async () => {
    await asUser(app, null, async () => {
      await as(maria);
      const id = await ask(maria, "Reply visibility");
      await as(priya);
      await app.query("SELECT app.reply_support_request($1, 'Here is the answer.')", [id]);
      await as(maria);
      const { loadMessages } = await import("@/lib/ops/support");
      const tx = {
        query: async (sql: string, params?: unknown[]) => (await app.query(sql, params)).rows,
        one: async (sql: string, params?: unknown[]) => (await app.query(sql, params)).rows[0] ?? null,
      };
      const messages = await loadMessages(tx, id);
      expect(messages.map((m) => [m.from_staff, m.author_name])).toEqual([
        [false, "Maria Santos"],
        [true, "Finance support"],
      ]);
    });
  });
});
