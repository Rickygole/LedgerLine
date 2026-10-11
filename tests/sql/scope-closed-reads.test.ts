import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let marisol: string;
let daniel: string;
let priya: string;
let inSubmission: string;
let outSubmission: string;
let inOrg: string;
let outOrg: string;
let outAssignment: string;
let dycdOrgs: Set<string>;
let outOrgUser: string;

const PERIOD = "FY26-YE";
const TODAY = "2026-09-16";

beforeAll(async () => {
  owner = await connect(ownerUrl());
  marisol = await userId(owner, "marisol.vandenberg");
  daniel = await userId(owner, "daniel.cho");
  priya = await userId(owner, "priya");
  const pick = async (test: string) =>
    (
      await owner.query(
        `SELECT s.id AS submission, a.id AS assignment, a.org_id AS org
         FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN initiative i ON i.id = a.initiative_id
         WHERE s.status = 'submitted' AND ${test}
           AND NOT EXISTS (
             SELECT 1 FROM assignment o JOIN initiative oi ON oi.id = o.initiative_id
             WHERE o.org_id = a.org_id AND ${test.includes("= 'DYCD'") ? "oi.administering_agency IS DISTINCT FROM 'DYCD'" : "oi.administering_agency = 'DYCD'"})
         ORDER BY s.reference_no LIMIT 1`,
      )
    ).rows[0] as { submission: string; assignment: string; org: string };
  const inside = await pick("i.administering_agency = 'DYCD'");
  const outside = await pick("i.administering_agency IS DISTINCT FROM 'DYCD'");
  inSubmission = inside.submission;
  inOrg = inside.org;
  outSubmission = outside.submission;
  outOrg = outside.org;
  outAssignment = outside.assignment;
  dycdOrgs = new Set(
    (
      await owner.query<{ org_id: string }>(
        `SELECT DISTINCT a.org_id FROM assignment a JOIN initiative i ON i.id = a.initiative_id
         WHERE i.administering_agency = 'DYCD'`,
      )
    ).rows.map((r) => r.org_id),
  );
  outOrgUser = (await owner.query("SELECT id FROM app_user WHERE org_id = $1 AND active LIMIT 1", [outOrg])).rows[0].id;
});

afterAll(async () => {
  await owner?.end();
});

async function as<T>(user: string, fn: () => Promise<T>, setup: string[][] = []): Promise<T> {
  await owner.query("BEGIN");
  try {
    for (const [sql, ...params] of setup) await owner.query(sql, params);
    await owner.query("SET LOCAL ROLE app_server");
    await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
    return await fn();
  } finally {
    await owner.query("ROLLBACK");
  }
}

describe("[US-060][BR-017] reads that bypass table policies follow the access scope", () => {
  it("lists reminder targets only for organizations with an in-scope assignment", async () => {
    const targets = async () =>
      (
        await owner.query<{ org_id: string }>("SELECT DISTINCT org_id FROM app.reminder_targets($1, $2::date)", [
          PERIOD,
          TODAY,
        ])
      ).rows.map((r) => r.org_id);
    const everyone = await as(daniel, targets);
    const scoped = await as(marisol, targets);
    expect(everyone.length).toBeGreaterThan(scoped.length);
    expect(scoped.length).toBeGreaterThan(0);
    for (const org of scoped) expect(dycdOrgs.has(org), org).toBe(true);
    expect(everyone.some((org) => !dycdOrgs.has(org))).toBe(true);
  });

  it("shows contacts only for organizations with an in-scope assignment", async () => {
    const contactOrgs = async () =>
      (await owner.query<{ org_id: string }>("SELECT DISTINCT org_id FROM contact")).rows.map((r) => r.org_id);
    const everyone = await as(daniel, contactOrgs);
    const scoped = await as(marisol, contactOrgs);
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.length).toBeLessThan(everyone.length);
    expect(scoped).toContain(inOrg);
    expect(scoped).not.toContain(outOrg);
    const own = await as(
      outOrgUser,
      async () => (await owner.query("SELECT 1 FROM contact WHERE org_id = $1", [outOrg])).rowCount,
    );
    expect(own).toBeGreaterThan(0);
  });

  it("lets a scoped analyst claim and finish only in-scope outbox messages", async () => {
    const setup = [inSubmission, outSubmission].map((id) => [
      "INSERT INTO outbox (to_email, template, subject, body_text, submission_id, org_id, created_by) SELECT 'a@example.org', 'return_notice', 'planted', 'planted', $1::uuid, a.org_id, NULL FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE s.id = $1::uuid",
      id,
    ]);
    await as(
      marisol,
      async () => {
        const claimedOut = await owner.query("SELECT id FROM app.claim_outbox($1, 10)", [outSubmission]);
        expect(claimedOut.rowCount).toBe(0);
        const claimedIn = await owner.query<{ id: string }>("SELECT id FROM app.claim_outbox($1, 10)", [inSubmission]);
        expect(claimedIn.rowCount).toBe(1);
        const finished = await owner.query("SELECT app.finish_outbox($1, 'recorded', NULL, NULL) AS next", [
          claimedIn.rows[0].id,
        ]);
        expect(finished.rows[0].next).toBe("recorded");
      },
      setup,
    );
    await as(
      daniel,
      async () => {
        expect((await owner.query("SELECT id FROM app.claim_outbox($1, 10)", [outSubmission])).rowCount).toBe(1);
      },
      setup,
    );
  });

  it("refuses to finish a message the caller could not claim", async () => {
    await as(marisol, async () => {
      const id = (await owner.query<{ id: string }>("SELECT id FROM outbox WHERE subject = 'planted-sending'")).rows;
      expect(id).toHaveLength(0);
    }, []);
    await owner.query("BEGIN");
    try {
      const row = await owner.query<{ id: string }>(
        `INSERT INTO outbox (to_email, template, subject, body_text, submission_id, org_id, status, claimed_at)
         SELECT 'a@example.org', 'return_notice', 'planted-sending', 'x', $1::uuid, a.org_id, 'sending', now()
         FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE s.id = $1::uuid RETURNING id`,
        [outSubmission],
      );
      await owner.query("SET LOCAL ROLE app_server");
      await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: marisol })]);
      const result = await owner.query("SELECT app.finish_outbox($1, 'recorded', NULL, NULL) AS next", [
        row.rows[0].id,
      ]);
      expect(result.rows[0].next).toBeNull();
    } finally {
      await owner.query("ROLLBACK");
    }
  });

  it("keeps the audit log closed to a scoped analyst for assignment and administrator-only events", async () => {
    const planted = async (user: string) => {
      await owner.query("BEGIN");
      try {
        for (const [entity, id] of [
          ["assignment", outAssignment],
          ["security_incident", outAssignment],
          ["incident_contact", outAssignment],
          ["uat_session", outAssignment],
          ["training_record", outAssignment],
          ["app_user", outAssignment],
          ["fiscal_year", "FY26"],
        ])
          await owner.query(
            "INSERT INTO audit_event (entity, entity_id, action, note) VALUES ($1, $2, 'planted', 'planted-closed')",
            [entity, id],
          );
        await owner.query("SET LOCAL ROLE app_server");
        await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
        return (
          await owner.query<{ entity: string }>("SELECT entity FROM audit_event WHERE note = 'planted-closed'")
        ).rows.map((r) => r.entity);
      } finally {
        await owner.query("ROLLBACK");
      }
    };
    expect(await planted(marisol)).toEqual([]);
    expect((await planted(priya)).sort()).toEqual([
      "app_user",
      "assignment",
      "fiscal_year",
      "incident_contact",
      "security_incident",
      "training_record",
      "uat_session",
    ]);
    expect((await planted(daniel)).sort()).toContain("assignment");
  });
});
