import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let daniel: string;
let draftId: string;
let submittedId: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  daniel = await userId(owner, "daniel.cho");
  draftId = (await owner.query("SELECT id FROM submission WHERE status = 'draft' LIMIT 1")).rows[0].id;
  submittedId = (await owner.query("SELECT id FROM submission WHERE status = 'submitted' LIMIT 1")).rows[0].id;
});

afterAll(async () => {
  await owner?.end();
});

async function tryInsert(submission: string): Promise<string | null> {
  await owner.query("BEGIN");
  try {
    await owner.query("SET LOCAL ROLE app_server");
    await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: daniel })]);
    await owner.query("INSERT INTO flag (submission_id, kind, source, note, created_by) VALUES ($1, 'manual', 'user', 'check this', $2)", [submission, daniel]);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  } finally {
    await owner.query("ROLLBACK");
  }
}

describe("[D18] manual flags", () => {
  it("are refused on a report that has not been submitted", async () => {
    expect(await tryInsert(draftId)).toBe("42501");
  });

  it("are allowed on a submitted report", async () => {
    expect(await tryInsert(submittedId)).toBeNull();
  });
});
