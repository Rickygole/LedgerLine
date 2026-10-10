import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let daniel: string;
let maria: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  daniel = await userId(owner, "daniel.cho");
  maria = await userId(owner, "maria.santos");
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function code(fn: () => Promise<unknown>): Promise<string | null> {
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

const record = (detectedSql: string, severity = "high") =>
  app.query(`SELECT app.record_incident(${detectedSql}, 'Sign-in tokens for two accounts were exposed in a log file.', 'Two Finance accounts. No report data was read.', $1) AS id`, [severity]);

describe("[US-058][BR-025] security incidents notify the Council and track remediation", () => {
  it("records an incident, queues a notice to every active designated contact, and writes the history", async () => {
    await asUser(app, priya, async () => {
      const activeEmails = (await app.query("SELECT email FROM incident_contact WHERE active ORDER BY email")).rows.map((r) => r.email);
      expect(activeEmails.length).toBeGreaterThanOrEqual(2);
      const id = (await record("now() - interval '2 hours'")).rows[0].id as string;
      const incident = (await app.query("SELECT reference, severity, contacts_notified, notified_at <= notify_due_at AS on_time, extract(epoch FROM notify_due_at - detected_at) / 3600 AS window_hours, extract(epoch FROM remediation_due_at - detected_at) / 86400 AS fix_days FROM security_incident WHERE id = $1", [id])).rows[0];
      expect(incident.reference).toMatch(/^INC-\d{4}$/);
      expect(incident.contacts_notified).toBe(activeEmails.length);
      expect(incident.on_time).toBe(true);
      expect(Number(incident.window_hours)).toBe(24);
      expect(Number(incident.fix_days)).toBe(7);
      const mail = (await app.query("SELECT to_email, subject, body_text FROM outbox WHERE template = 'security_incident' AND subject LIKE '%' || $1 || '%' ORDER BY to_email", [incident.reference])).rows;
      expect(mail.map((m) => m.to_email)).toEqual(activeEmails);
      expect(mail[0].body_text).toContain("Two Finance accounts");
      expect(mail[0].body_text).toContain("high");
      const events = (await app.query("SELECT kind FROM incident_event WHERE incident_id = $1 ORDER BY id", [id])).rows.map((r) => r.kind);
      expect(events).toEqual(["recorded", "notified"]);
      const audit = (await app.query("SELECT action, after FROM audit_event WHERE entity = 'security_incident' AND entity_id = $1", [id])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe("incident_recorded");
      expect(audit[0].after.on_time).toBe(true);
    });
  });

  it("flags a notice as late when the incident was detected more than 24 hours before it was recorded", async () => {
    await asUser(app, priya, async () => {
      const id = (await record("now() - interval '30 hours'", "critical")).rows[0].id as string;
      const row = (await app.query("SELECT notified_at <= notify_due_at AS on_time FROM security_incident WHERE id = $1", [id])).rows[0];
      expect(row.on_time).toBe(false);
      const audit = (await app.query("SELECT after FROM audit_event WHERE entity_id = $1", [id])).rows[0];
      expect(audit.after.on_time).toBe(false);
    });
  });

  it("tracks a remediation report with root cause, actions, prevention and a completed date, keeping every version", async () => {
    await asUser(app, priya, async () => {
      const id = (await record("now() - interval '3 days'")).rows[0].id as string;
      await app.query("SELECT app.record_remediation($1, 'Log level left on debug.', 'Rotated tokens and removed the log.', 'Block debug logging in production builds.', NULL)", [id]);
      let latest = (await app.query("SELECT completed_on FROM incident_remediation WHERE incident_id = $1 ORDER BY id DESC LIMIT 1", [id])).rows[0];
      expect(latest.completed_on).toBeNull();
      await app.query("SELECT app.record_remediation($1, 'Log level left on debug.', 'Rotated tokens and removed the log.', 'Block debug logging in production builds.', (now() AT TIME ZONE 'America/New_York')::date)", [id]);
      latest = (await app.query("SELECT completed_on FROM incident_remediation WHERE incident_id = $1 ORDER BY id DESC LIMIT 1", [id])).rows[0];
      expect(latest.completed_on).not.toBeNull();
      expect((await app.query("SELECT count(*)::int AS n FROM incident_remediation WHERE incident_id = $1", [id])).rows[0].n).toBe(2);
      const events = (await app.query("SELECT kind FROM incident_event WHERE incident_id = $1 ORDER BY id", [id])).rows.map((r) => r.kind);
      expect(events).toEqual(["recorded", "notified", "remediation_reported", "remediation_reported", "remediation_completed"]);
      const mail = (await app.query("SELECT count(*)::int AS n FROM outbox WHERE template = 'security_remediation' AND created_by = $1", [priya])).rows[0].n;
      expect(mail).toBeGreaterThanOrEqual(2);
      expect(await code(() => app.query("SELECT app.record_remediation($1, 'x', 'y', 'z', (now() AT TIME ZONE 'America/New_York')::date + 3)", [id]))).toBe("23514");
      expect(await code(() => app.query("SELECT app.record_remediation($1, 'x', 'y', 'z', (now() AT TIME ZONE 'America/New_York')::date - 10)", [id]))).toBe("23514");
    });
  });

  it("keeps the history append only, even for the database owner", async () => {
    const id = (await owner.query("SELECT id FROM security_incident LIMIT 1")).rows[0].id;
    for (const sql of [
      ["UPDATE security_incident SET severity = 'low' WHERE id = $1", [id]],
      ["DELETE FROM security_incident WHERE id = $1", [id]],
      ["UPDATE incident_event SET detail = 'x' WHERE incident_id = $1", [id]],
      ["DELETE FROM incident_event WHERE incident_id = $1", [id]],
      ["UPDATE incident_remediation SET actions = 'x' WHERE incident_id = $1", [id]],
      ["DELETE FROM incident_remediation WHERE incident_id = $1", [id]],
      ["TRUNCATE security_incident CASCADE", []],
    ] as [string, unknown[]][]) {
      let failed: string | null = null;
      try {
        await owner.query(sql[0], sql[1]);
      } catch (error) {
        failed = (error as { code?: string }).code ?? "unknown";
      }
      expect(failed, sql[0]).toBe("42501");
    }
  });

  it("refuses to record a future detection time, and keeps at least one contact active", async () => {
    await asUser(app, priya, async () => {
      expect(await code(() => record("now() + interval '1 day'"))).toBe("23514");
      const active = (await app.query("SELECT id FROM incident_contact WHERE active ORDER BY created_at")).rows;
      for (const [index, contact] of active.entries()) {
        const result = await code(() => app.query("SELECT app.set_incident_contact_active($1, false)", [contact.id]));
        expect(result).toBe(index === active.length - 1 ? "23514" : null);
      }
      expect((await app.query("SELECT count(*)::int AS n FROM incident_contact WHERE active")).rows[0].n).toBe(1);
    });
  });

  it("refuses to record when no designated contact is active", async () => {
    await owner.query("BEGIN");
    try {
      await owner.query("UPDATE incident_contact SET active = false");
      await owner.query("SET LOCAL ROLE app_server");
      await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: priya })]);
      let failed: string | null = null;
      try {
        await owner.query("SELECT app.record_incident(now(), 'Something happened.', 'Nothing yet.', 'low')");
      } catch (error) {
        failed = (error as { code?: string }).code ?? "unknown";
      }
      expect(failed).toBe("23514");
    } finally {
      await owner.query("ROLLBACK");
    }
  });

  it("allows only an administrator to record incidents or manage contacts, and hides them from everyone else", async () => {
    await asUser(app, daniel, async () => {
      expect(await code(() => record("now()"))).toBe("42501");
      expect(await code(() => app.query("SELECT app.add_incident_contact('A', 'B', 'a@b.org')"))).toBe("42501");
      expect((await app.query("SELECT count(*)::int AS n FROM security_incident")).rows[0].n).toBe(0);
      expect((await app.query("SELECT count(*)::int AS n FROM incident_contact")).rows[0].n).toBe(0);
    });
    await asUser(app, maria, async () => {
      expect(await code(() => record("now()"))).toBe("42501");
    });
  });

  it("hides incident notices from Finance staff who are not administrators", async () => {
    await asUser(app, daniel, async () => {
      expect((await app.query("SELECT count(*)::int AS n FROM outbox WHERE template LIKE 'security\\_%'")).rows[0].n).toBe(0);
      expect((await app.query("SELECT count(*)::int AS n FROM outbox")).rows[0].n).toBeGreaterThan(0);
    });
    await asUser(app, priya, async () => {
      expect((await app.query("SELECT count(*)::int AS n FROM outbox WHERE template LIKE 'security\\_%'")).rows[0].n).toBeGreaterThan(0);
    });
  });

  it("adds a designated contact, audits it, and includes that contact in the next notice", async () => {
    await asUser(app, priya, async () => {
      await app.query("SELECT app.add_incident_contact('Odalys Preston', 'Records Officer, Council', 'Odalys.Preston@council.example.gov')");
      const id = (await record("now() - interval '1 hour'", "low")).rows[0].id as string;
      const reference = (await app.query("SELECT reference FROM security_incident WHERE id = $1", [id])).rows[0].reference;
      const sent = (await app.query("SELECT to_email FROM outbox WHERE template = 'security_incident' AND subject LIKE '%' || $1 || '%'", [reference])).rows.map((r) => r.to_email);
      expect(sent).toContain("odalys.preston@council.example.gov");
      expect(await code(() => app.query("SELECT app.add_incident_contact('Dup', 'Dup', 'odalys.preston@council.example.gov')"))).toBe("23505");
      const audit = (await app.query("SELECT count(*)::int AS n FROM audit_event WHERE entity = 'incident_contact' AND action = 'incident_contact_added'")).rows[0].n;
      expect(audit).toBeGreaterThan(0);
    });
  });
});
