import bcrypt from "bcryptjs";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/password";
import { appUrl, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let daniel: string;
let grace: string;
let maria: string;
let mariaOrg: string;
const ORIGIN = "https://ledgerline.test";
const FRESH_HASH = bcrypt.hashSync("a-new-password-123", 4);

async function claims(client: Client, id: string | null) {
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [id ? JSON.stringify({ sub: id }) : ""]);
}

async function inTx<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function code(client: Client, fn: () => Promise<unknown>): Promise<string | null> {
  await client.query("SAVEPOINT attempt");
  try {
    await fn();
    await client.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

function tokenFrom(link: string): string {
  const match = link.match(/\/reset\?token=([0-9a-f]{64})$/);
  if (!match) throw new Error("no token in the issued link");
  return match[1];
}

async function issueReset(client: Client, target: string): Promise<string> {
  const { rows } = await client.query<{ link: string }>("SELECT link FROM app.queue_password_reset($1, $2)", [
    target,
    ORIGIN,
  ]);
  return tokenFrom(rows[0].link);
}

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  daniel = await userId(owner, "daniel.cho");
  grace = await userId(owner, "grace.chen");
  maria = await userId(owner, "maria.santos");
  mariaOrg = (await owner.query("SELECT org_id FROM app_user WHERE id = $1", [maria])).rows[0].org_id;
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

describe("[US-038] password reset tokens", () => {
  it("emails a link, stores only a hash, and sets the password once", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      const token = await issueReset(app, maria);
      const email = "maria.santos@motthavenyouth.example.org";
      const body = (
        await app.query(
          "SELECT body_text, org_id FROM outbox WHERE template = 'password_reset' AND to_email = $1 ORDER BY created_at DESC LIMIT 1",
          [email],
        )
      ).rows[0];
      expect(body.body_text).toContain(`${ORIGIN}/reset?token=[withheld]`);
      expect(body.body_text).not.toContain(token);
      expect(body.org_id).toBeNull();
      const stored = await owner.query("SELECT 1 FROM password_token WHERE token_hash = $1 OR token_hash = $2", [
        token,
        hashToken(token),
      ]);
      expect(stored.rowCount).toBe(0);

      await claims(app, null);
      const info = await app.query("SELECT email FROM app.password_token_info($1)", [hashToken(token)]);
      expect(info.rows[0]?.email).toBe(email);
      await app.query("SELECT app.reset_password($1, $2)", [hashToken(token), FRESH_HASH]);
      const login = await app.query("SELECT password_hash FROM app.login_lookup($1)", [email]);
      expect(await bcrypt.compare("a-new-password-123", login.rows[0].password_hash)).toBe(true);

      expect(
        await code(app, () => app.query("SELECT app.reset_password($1, $2)", [hashToken(token), FRESH_HASH])),
      ).toBe("23514");
      expect((await app.query("SELECT email FROM app.password_token_info($1)", [hashToken(token)])).rowCount).toBe(0);
    });
  });

  it("rejects an expired token", async () => {
    await inTx(owner, async () => {
      await claims(owner, priya);
      const token = await issueReset(owner, maria);
      await owner.query("UPDATE password_token SET expires_at = now() - interval '1 minute' WHERE token_hash = $1", [
        hashToken(token),
      ]);
      expect((await owner.query("SELECT email FROM app.password_token_info($1)", [hashToken(token)])).rowCount).toBe(0);
      expect(
        await code(owner, () => owner.query("SELECT app.reset_password($1, $2)", [hashToken(token), FRESH_HASH])),
      ).toBe("23514");
    });
  });

  it("makes the token last 30 minutes", async () => {
    await inTx(owner, async () => {
      await claims(owner, priya);
      await owner.query("SELECT app.queue_password_reset($1, $2)", [maria, ORIGIN]);
      const { rows } = await owner.query(
        "SELECT extract(epoch FROM (expires_at - created_at))::int AS seconds FROM password_token WHERE user_id = $1 AND used_at IS NULL",
        [maria],
      );
      expect(rows).toEqual([{ seconds: 1800 }]);
    });
  });

  it("invalidates an earlier link when a newer one is issued", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      const first = await issueReset(app, maria);
      await issueReset(app, maria);
      await claims(app, null);
      expect(
        await code(app, () => app.query("SELECT app.reset_password($1, $2)", [hashToken(first), FRESH_HASH])),
      ).toBe("23514");
    });
  });

  it("refuses a hash that is not bcrypt and an unknown token", async () => {
    await inTx(app, async () => {
      await claims(app, null);
      expect(
        await code(app, () => app.query("SELECT app.reset_password($1, $2)", [hashToken("nope"), FRESH_HASH])),
      ).toBe("23514");
      expect(
        await code(app, () =>
          app.query("SELECT app.reset_password($1, $2)", [hashToken("nope"), "plain-text-password"]),
        ),
      ).toBe("23514");
    });
  });

  it("lets only a finance admin send a reset", async () => {
    for (const actor of [daniel, grace, maria]) {
      await inTx(app, async () => {
        await claims(app, actor);
        expect(await code(app, () => app.query("SELECT app.queue_password_reset($1, $2)", [priya, ORIGIN]))).toBe(
          "42501",
        );
      });
    }
  });

  it("[BR-010] does not let app_server read password hashes or tokens directly", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      expect(await code(app, () => app.query("SELECT password_hash FROM app_user LIMIT 1"))).toBe("42501");
      expect(await code(app, () => app.query("SELECT token_hash FROM password_token LIMIT 1"))).toBe("42501");
    });
  });
});

describe("[US-013] sessions can be revoked", () => {
  it("rejects a session after sign out and keeps other sessions", async () => {
    await inTx(app, async () => {
      await claims(app, maria);
      const version = (await app.query("SELECT app.current_session_version() AS v")).rows[0].v;
      const jti = "11111111-1111-4111-8111-111111111111";
      const other = "22222222-2222-4222-8222-222222222222";
      expect((await app.query("SELECT app.session_valid($1, $2) AS ok", [jti, version])).rows[0].ok).toBe(true);
      await app.query("SELECT app.revoke_session($1, now() + interval '8 hours')", [jti]);
      expect((await app.query("SELECT app.session_valid($1, $2) AS ok", [jti, version])).rows[0].ok).toBe(false);
      expect((await app.query("SELECT app.session_valid($1, $2) AS ok", [other, version])).rows[0].ok).toBe(true);
      await claims(app, priya);
      const audit = await app.query(
        "SELECT 1 FROM audit_event WHERE entity = 'user' AND action = 'sign_out' AND actor_id = $1",
        [maria],
      );
      expect(audit.rowCount).toBe(1);
    });
  });

  it("rejects every older session once the password changes", async () => {
    await inTx(app, async () => {
      await claims(app, maria);
      const version = (await app.query("SELECT app.current_session_version() AS v")).rows[0].v;
      const jti = "33333333-3333-4333-8333-333333333333";
      expect((await app.query("SELECT app.session_valid($1, $2) AS ok", [jti, version])).rows[0].ok).toBe(true);
      await claims(app, priya);
      const token = await issueReset(app, maria);
      await claims(app, null);
      await app.query("SELECT app.reset_password($1, $2)", [hashToken(token), FRESH_HASH]);
      await claims(app, maria);
      expect((await app.query("SELECT app.session_valid($1, $2) AS ok", [jti, version])).rows[0].ok).toBe(false);
      const fresh = (await app.query("SELECT app.current_session_version() AS v")).rows[0].v;
      expect(fresh).toBe(version + 1);
      expect((await app.query("SELECT app.session_valid($1, $2) AS ok", [jti, fresh])).rows[0].ok).toBe(true);
    });
  });

  it("rejects a session for a deactivated account", async () => {
    await inTx(owner, async () => {
      await owner.query("UPDATE app_user SET active = false WHERE id = $1", [maria]);
      await claims(owner, maria);
      expect(
        (await owner.query("SELECT app.session_valid($1, 0) AS ok", ["44444444-4444-4444-8444-444444444444"])).rows[0]
          .ok,
      ).toBe(false);
    });
  });
});

describe("[US-036] creating users", () => {
  const call = (client: Client, args: [string, string, string | null, string, string | null]) =>
    client.query("SELECT user_id AS id, outbox_id, link FROM app.create_user($1, $2, $3, $4, $5, $6)", [
      ...args,
      ORIGIN,
    ]);

  it("lets an admin add a Finance user who cannot sign in until the password is set", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      const created = await call(app, [
        "New.Analyst@finance.example.gov",
        "New Analyst",
        "Budget analyst",
        "finance_analyst",
        null,
      ]);
      const id = created.rows[0].id as string;
      const row = (await app.query("SELECT email, role, org_id, can_sign_in, active FROM app_user WHERE id = $1", [id]))
        .rows[0];
      expect(row).toEqual({
        email: "new.analyst@finance.example.gov",
        role: "finance_analyst",
        org_id: null,
        can_sign_in: false,
        active: true,
      });
      expect(
        (await app.query("SELECT 1 FROM app.login_lookup($1)", ["new.analyst@finance.example.gov"])).rowCount,
      ).toBe(0);
      expect(
        (
          await app.query(
            "SELECT 1 FROM audit_event WHERE entity = 'app_user' AND entity_id = $1 AND action = 'user_create' AND actor_id = $2",
            [id, priya],
          )
        ).rowCount,
      ).toBe(1);

      const token = tokenFrom(created.rows[0].link);
      await claims(app, null);
      await app.query("SELECT app.reset_password($1, $2)", [hashToken(token), FRESH_HASH]);
      expect(
        (await app.query("SELECT 1 FROM app.login_lookup($1)", ["new.analyst@finance.example.gov"])).rowCount,
      ).toBe(1);
    });
  });

  it("lets an admin add an organization submitter tied to an organization", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      const created = await call(app, [
        "carlos@motthavenyouth.example.org",
        "Carlos Vega",
        null,
        "cbo_submitter",
        mariaOrg,
      ]);
      const row = (await app.query("SELECT role, org_id FROM app_user WHERE id = $1", [created.rows[0].id])).rows[0];
      expect(row).toEqual({ role: "cbo_submitter", org_id: mariaOrg });
      await claims(app, maria);
      const visible = await app.query(
        "SELECT 1 FROM outbox WHERE template = 'password_set' AND to_email = 'carlos@motthavenyouth.example.org'",
      );
      expect(visible.rowCount).toBe(0);
    });
  });

  it("refuses analysts, viewers and organization users", async () => {
    for (const actor of [daniel, grace, maria]) {
      await inTx(app, async () => {
        await claims(app, actor);
        expect(
          await code(app, () => call(app, ["x@finance.example.gov", "X Person", null, "finance_viewer", null])),
        ).toBe("42501");
      });
    }
  });

  it("refuses duplicate emails, mismatched organizations, bad roles and bad emails", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      expect(
        await code(app, () => call(app, ["DANIEL.CHO@finance.example.gov", "Dup", null, "finance_viewer", null])),
      ).toBe("23505");
      expect(await code(app, () => call(app, ["a@finance.example.gov", "A", null, "cbo_submitter", null]))).toBe(
        "23514",
      );
      expect(await code(app, () => call(app, ["b@finance.example.gov", "B", null, "finance_viewer", mariaOrg]))).toBe(
        "23514",
      );
      expect(await code(app, () => call(app, ["c@finance.example.gov", "C", null, "superuser", null]))).toBe("23514");
      expect(await code(app, () => call(app, ["not-an-email", "D", null, "finance_viewer", null]))).toBe("23514");
    });
  });
});

describe("[US-035] free-text limits are enforced in SQL", () => {
  it("rejects an oversized audit note and flag note", async () => {
    await inTx(app, async () => {
      await claims(app, daniel);
      expect(
        await code(app, () =>
          app.query("SELECT app.write_audit('submission', 'x', 'note', $1, NULL, NULL, NULL)", ["a".repeat(4001)]),
        ),
      ).toBe("23514");
      const submission = (await owner.query("SELECT id FROM submission LIMIT 1")).rows[0].id;
      expect(
        await code(app, () =>
          app.query(
            "INSERT INTO flag (submission_id, kind, source, note, created_by) VALUES ($1, 'manual', 'user', $2, app.uid())",
            [submission, "b".repeat(2001)],
          ),
        ),
      ).toBe("23514");
    });
  });

  it("rejects an oversized correction reason", async () => {
    await inTx(owner, async () => {
      const { rows } = await owner.query("SELECT id FROM submission WHERE status = 'accepted' LIMIT 1");
      await claims(owner, daniel);
      const failed = await code(owner, () =>
        owner.query("SELECT app.correct_answer($1, 'program_name', '\"x\"'::jsonb, $2, '{}'::jsonb)", [
          rows[0].id,
          "r".repeat(2001),
        ]),
      );
      expect(failed).toBe("23514");
      const ok = await code(owner, () =>
        owner.query("SELECT app.correct_answer($1, 'program_name', '\"x\"'::jsonb, $2, '{}'::jsonb)", [
          rows[0].id,
          "r".repeat(2000),
        ]),
      );
      expect(ok).toBeNull();
    });
  });
});

describe("[BR-010] password links never reach the outbox", () => {
  const PRIVATE = ["password_reset", "password_set"];

  async function visibleTokenRows(actor: string): Promise<number> {
    await claims(app, actor);
    const { rows } = await app.query("SELECT body_text FROM outbox WHERE body_text ~ 'token=[0-9a-f]{20,}'");
    return rows.length;
  }

  it("keeps the live token out of every outbox row and out of non-admin reach", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      const token = await issueReset(app, maria);
      const created = await app.query("SELECT link FROM app.create_user($1, $2, $3, $4, $5, $6)", [
        "fresh.viewer@finance.example.gov",
        "Fresh Viewer",
        null,
        "finance_viewer",
        null,
        ORIGIN,
      ]);
      const setToken = tokenFrom(created.rows[0].link);
      for (const actor of [priya, daniel, grace]) {
        expect(await visibleTokenRows(actor)).toBe(0);
      }
      const asOwner = await owner.query(
        "SELECT 1 FROM outbox WHERE position($1 in body_text) > 0 OR position($2 in body_text) > 0",
        [token, setToken],
      );
      expect(asOwner.rowCount).toBe(0);
    });
  });

  it("lets only an admin read reset and set-password messages", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      await issueReset(app, maria);
      await app.query("SELECT * FROM app.create_user($1, $2, $3, $4, $5, $6)", [
        "second.viewer@finance.example.gov",
        "Second Viewer",
        null,
        "finance_viewer",
        null,
        ORIGIN,
      ]);
      const adminSees = await app.query("SELECT template FROM outbox WHERE template = ANY($1)", [PRIVATE]);
      expect(adminSees.rowCount).toBeGreaterThanOrEqual(2);
      for (const actor of [daniel, grace]) {
        await claims(app, actor);
        const seen = await app.query("SELECT template FROM outbox WHERE template = ANY($1)", [PRIVATE]);
        expect(seen.rowCount).toBe(0);
      }
    });
  });

  it("hides migrated historic messages too", async () => {
    const { rows } = await owner.query(
      "SELECT count(*)::int AS n FROM outbox WHERE template = ANY($1) AND body_text ~ 'token=[0-9a-fA-F]{20,}'",
      [PRIVATE],
    );
    expect(rows[0].n).toBe(0);
  });

  it("still lets an admin issue a working link end to end", async () => {
    await inTx(app, async () => {
      await claims(app, priya);
      const token = await issueReset(app, maria);
      await claims(app, null);
      expect((await app.query("SELECT email FROM app.password_token_info($1)", [hashToken(token)])).rowCount).toBe(1);
      await app.query("SELECT app.reset_password($1, $2)", [hashToken(token), FRESH_HASH]);
      expect(
        (await app.query("SELECT 1 FROM app.login_lookup($1)", ["maria.santos@motthavenyouth.example.org"])).rowCount,
      ).toBe(1);
    });
  });
});
