import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, asUser, connect, errorCode, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let maria: string;
let tomas: string;
let daniel: string;
let grace: string;
let mariaOrg: string;
let otherSubmission: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  maria = await userId(owner, "maria.santos");
  tomas = await userId(owner, "tomas.rivera");
  daniel = await userId(owner, "daniel.cho");
  grace = await userId(owner, "grace.chen");
  mariaOrg = (await owner.query("SELECT org_id FROM app_user WHERE id = $1", [maria])).rows[0].org_id;
  otherSubmission = (
    await owner.query(
      `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE a.org_id <> $1 LIMIT 1`,
      [mariaOrg]
    )
  ).rows[0].id;
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

describe("[BR-010][US-014] organizations see only their own reports", () => {
  it("returns nothing at all without a signed-in identity", async () => {
    const count = await asUser(app, null, async () => (await app.query("SELECT count(*)::int AS n FROM submission")).rows[0].n);
    expect(count).toBe(0);
  });

  it("limits Maria to her own organization and submissions", async () => {
    const result = await asUser(app, maria, async () => ({
      orgs: (await app.query("SELECT count(*)::int AS n FROM organization")).rows[0].n,
      foreign: (await app.query("SELECT count(*)::int AS n FROM submission WHERE id = $1", [otherSubmission])).rows[0].n,
      foreignAnswers: (await app.query("SELECT count(*)::int AS n FROM answer WHERE submission_id = $1", [otherSubmission])).rows[0].n,
    }));
    expect(result.orgs).toBe(1);
    expect(result.foreign).toBe(0);
    expect(result.foreignAnswers).toBe(0);
  });

  it("[US-015] shows Maria a report her colleague submitted", async () => {
    const names = await asUser(app, maria, async () =>
      (
        await app.query(
          `SELECT u.full_name FROM submission s JOIN app_user u ON u.id = s.submitted_by WHERE s.submitted_by IS NOT NULL`
        )
      ).rows.map((r) => r.full_name)
    );
    expect(names).toContain("James Okafor");
  });

  it("refuses a storage path under another organization's EIN", async () => {
    const allowed = await asUser(app, maria, async () => {
      const otherEin = (await owner.query("SELECT ein FROM organization WHERE id <> $1 LIMIT 1", [mariaOrg])).rows[0].ein;
      const mine = (await app.query("SELECT app.can_access_path($1) AS ok", [`00-1040217/x/file.pdf`])).rows[0].ok;
      const theirs = (await app.query("SELECT app.can_access_path($1) AS ok", [`${otherEin}/x/file.pdf`])).rows[0].ok;
      return { mine, theirs };
    });
    expect(allowed).toEqual({ mine: true, theirs: false });
  });

  it("gives another organization's submitter no view of Maria's data", async () => {
    const count = await asUser(app, tomas, async () =>
      (await app.query("SELECT count(*)::int AS n FROM organization WHERE id = $1", [mariaOrg])).rows[0].n
    );
    expect(count).toBe(0);
  });
});

describe("[BR-022] status can only change through the workflow function", () => {
  it("denies a direct status update even for the reporting organization", async () => {
    const code = await asUser(app, maria, () => errorCode(() => app.query("UPDATE submission SET status = 'accepted'")));
    expect(code).toBe("42501");
  });

  it("denies a direct status update for a finance analyst", async () => {
    const code = await asUser(app, daniel, () => errorCode(() => app.query("UPDATE submission SET status = 'accepted'")));
    expect(code).toBe("42501");
  });

  it("refuses submit from a different organization through the function", async () => {
    const code = await asUser(app, tomas, () =>
      errorCode(async () => {
        const draft = (
          await owner.query(`SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE a.org_id <> (SELECT org_id FROM app_user WHERE id = $1) AND s.status = 'draft' LIMIT 1`, [tomas])
        ).rows[0].id;
        await app.query("SELECT * FROM app.transition_submission($1, 'submit', NULL, '{}'::jsonb, NULL, NULL, NULL)", [draft]);
      })
    );
    expect(code).toBe("42501");
  });
});

describe("[US-057][BR-019] audit history is append-only", () => {
  it("denies update and delete on audit events for the app role", async () => {
    const update = await asUser(app, daniel, () => errorCode(() => app.query("UPDATE audit_event SET note = 'changed'")));
    const remove = await asUser(app, daniel, () => errorCode(() => app.query("DELETE FROM audit_event")));
    expect(update).toBe("42501");
    expect(remove).toBe("42501");
  });

  it("denies update and delete on submission revisions for the app role", async () => {
    const update = await asUser(app, daniel, () => errorCode(() => app.query("UPDATE submission_revision SET reason = 'x'")));
    const remove = await asUser(app, daniel, () => errorCode(() => app.query("DELETE FROM submission_revision")));
    expect(update).toBe("42501");
    expect(remove).toBe("42501");
  });

  it("blocks even the database owner from rewriting history", async () => {
    await owner.query("BEGIN");
    const code = await errorCode(() => owner.query("UPDATE audit_event SET note = 'changed' WHERE id = (SELECT min(id) FROM audit_event)"));
    await owner.query("ROLLBACK");
    expect(code).toBe("42501");
  });
});

describe("[US-037] view-only finance users cannot write", () => {
  it("lets a viewer read but not flag a submission", async () => {
    const result = await asUser(app, grace, async () => ({
      visible: (await app.query("SELECT count(*)::int AS n FROM submission")).rows[0].n,
      flag: await errorCode(() => app.query("INSERT INTO flag (submission_id, kind, source, note) VALUES ($1, 'manual', 'user', 'x')", [otherSubmission])),
    }));
    expect(result.visible).toBeGreaterThan(0);
    expect(result.flag).toBe("42501");
  });
});

describe("[US-016][BR-009] an organization can start a report it owes", () => {
  it("creates a draft for its own assignment and cannot create one for another organization", async () => {
    const own = (
      await owner.query(
        `SELECT a.id AS assignment, f.id AS form FROM assignment a JOIN form_version f ON f.initiative_id = a.initiative_id AND f.status = 'published'
         WHERE a.org_id = $1 AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = 'FY27-MY') LIMIT 1`,
        [mariaOrg]
      )
    ).rows[0];
    const other = (
      await owner.query(
        `SELECT a.id AS assignment, f.id AS form FROM assignment a JOIN form_version f ON f.initiative_id = a.initiative_id AND f.status = 'published'
         WHERE a.org_id <> $1 LIMIT 1`,
        [mariaOrg]
      )
    ).rows[0];
    const result = await asUser(app, maria, async () => {
      await app.query(
        `INSERT INTO submission (id, reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
         VALUES (gen_random_uuid(), 'LL-TEST-OWN', $1, 'FY27-MY', $2, 'draft', app.uid(), app.uid())`,
        [own.assignment, own.form]
      );
      const visible = (await app.query("SELECT count(*)::int AS n FROM submission WHERE reference_no = 'LL-TEST-OWN'")).rows[0].n;
      await app.query("SAVEPOINT s");
      const foreign = await errorCode(() =>
        app.query(
          `INSERT INTO submission (id, reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
           VALUES (gen_random_uuid(), 'LL-TEST-OTHER', $1, 'FY27-MY', $2, 'draft', app.uid(), app.uid())`,
          [other.assignment, other.form]
        )
      );
      return { visible, foreign };
    });
    expect(result).toEqual({ visible: 1, foreign: "42501" });
  });
});
