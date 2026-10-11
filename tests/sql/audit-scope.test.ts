import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let marisol: string;
let daniel: string;
let orgUser: string;
let inSubmission: string;
let outSubmission: string;
let inInitiative: string;
let outInitiative: string;
let inForm: string;
let outForm: string;
let inAssignment: string;
let outAssignment: string;
let inOrg: string;
let outOrg: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  marisol = await userId(owner, "marisol.vandenberg");
  daniel = await userId(owner, "daniel.cho");
  const pick = async (agencyTest: string) =>
    (
      await owner.query(
        `SELECT s.id AS submission, a.id AS assignment, a.org_id AS org, a.initiative_id AS initiative,
                (SELECT f.id FROM form_version f WHERE f.initiative_id = a.initiative_id LIMIT 1) AS form
         FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN initiative i ON i.id = a.initiative_id
         WHERE s.status = 'submitted' AND ${agencyTest}
           AND NOT EXISTS (
             SELECT 1 FROM assignment o JOIN initiative oi ON oi.id = o.initiative_id
             WHERE o.org_id = a.org_id AND ${agencyTest.includes("= 'DYCD'") ? "oi.administering_agency IS DISTINCT FROM 'DYCD'" : "oi.administering_agency = 'DYCD'"})
         ORDER BY s.reference_no LIMIT 1`,
      )
    ).rows[0] as { submission: string; assignment: string; org: string; initiative: string; form: string };
  const inside = await pick("i.administering_agency = 'DYCD'");
  const outside = await pick("i.administering_agency IS DISTINCT FROM 'DYCD'");
  inSubmission = inside.submission;
  inAssignment = inside.assignment;
  inOrg = inside.org;
  inInitiative = inside.initiative;
  inForm = inside.form;
  outSubmission = outside.submission;
  outAssignment = outside.assignment;
  outOrg = outside.org;
  outInitiative = outside.initiative;
  outForm = outside.form;
  orgUser = (await owner.query("SELECT id FROM app_user WHERE org_id = $1 AND active LIMIT 1", [inOrg])).rows[0].id;
});

afterAll(async () => {
  await owner?.end();
});

async function seen(user: string, extra: string[][] = []): Promise<Set<string>> {
  await owner.query("BEGIN");
  try {
    for (const [entity, entityId, action] of [
      ["form_version", inForm, "publish"],
      ["form_version", outForm, "publish"],
      ["assignment", inAssignment, "create"],
      ["assignment", outAssignment, "create"],
      ["organization", inOrg, "update"],
      ["organization", outOrg, "update"],
      ["initiative", inInitiative, "update"],
      ["initiative", outInitiative, "update"],
      ["question", "planted_question", "update"],
      ["export", "data_package", "export"],
      ["form_version", "not-a-uuid", "publish"],
      ["submission", inSubmission, "flag_raised"],
      ["submission", outSubmission, "flag_raised"],
    ]) {
      await owner.query("INSERT INTO audit_event (entity, entity_id, action, note) VALUES ($1, $2, $3, 'planted')", [
        entity,
        entityId,
        action,
      ]);
    }
    for (const [sql, ...params] of extra) await owner.query(sql, params);
    await owner.query("SET LOCAL ROLE app_server");
    await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
    const { rows } = await owner.query<{ entity: string; entity_id: string; action: string }>(
      "SELECT entity, entity_id, action FROM audit_event WHERE note = 'planted'",
    );
    return new Set(rows.map((r) => `${r.entity}:${r.entity_id}:${r.action}`));
  } finally {
    await owner.query("ROLLBACK");
  }
}

describe("[US-060][BR-017] Audit log visibility follows the access scope", () => {
  it("shows an unscoped analyst every planted event", async () => {
    const rows = await seen(daniel);
    expect(rows.has(`form_version:${outForm}:publish`)).toBe(true);
    expect(rows.has("question:planted_question:update")).toBe(true);
    expect(rows.has("export:data_package:export")).toBe(true);
    expect(rows.has(`assignment:${outAssignment}:create`)).toBe(true);
  });

  it("limits a scoped analyst to events about in-scope records", async () => {
    const rows = await seen(marisol);
    for (const key of [
      `form_version:${inForm}:publish`,
      `assignment:${inAssignment}:create`,
      `organization:${inOrg}:update`,
      `initiative:${inInitiative}:update`,
      `submission:${inSubmission}:flag_raised`,
    ]) {
      expect(rows.has(key), key).toBe(true);
    }
    for (const key of [
      `form_version:${outForm}:publish`,
      `assignment:${outAssignment}:create`,
      `organization:${outOrg}:update`,
      `initiative:${outInitiative}:update`,
      `submission:${outSubmission}:flag_raised`,
      "question:planted_question:update",
      "export:data_package:export",
      "form_version:not-a-uuid:publish",
    ]) {
      expect(rows.has(key), key).toBe(false);
    }
  });

  it("scopes by initiative the same way", async () => {
    const rows = await seen(marisol, [
      [
        "UPDATE app_user SET scope_agencies = '{}', scope_initiatives = ARRAY[$1::uuid] WHERE id = $2",
        outInitiative,
        marisol,
      ],
    ]);
    expect(rows.has(`form_version:${outForm}:publish`)).toBe(true);
    expect(rows.has(`form_version:${inForm}:publish`)).toBe(false);
    expect(rows.has("question:planted_question:update")).toBe(false);
  });

  it("keeps flag events away from organization users", async () => {
    const rows = await seen(orgUser);
    expect(rows.has(`submission:${inSubmission}:flag_raised`)).toBe(false);
    expect(rows.has(`submission:${outSubmission}:flag_raised`)).toBe(false);
    expect(rows.has(`form_version:${inForm}:publish`)).toBe(false);
  });
});
