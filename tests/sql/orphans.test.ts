import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
let dir: string;
let maria: string;
let submission: string;
const kept = "orphan-test/kept.pdf";
const orphan = "orphan-test/orphan.pdf";
const fresh = "orphan-test/fresh.pdf";

async function put(name: string, ageHours: number) {
  const target = path.join(dir, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, "x");
  const when = new Date(Date.now() - ageHours * 3600 * 1000);
  await utimes(target, when, when);
}

beforeAll(async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  dir = await mkdtemp(path.join(tmpdir(), "ledgerline-sweep-"));
  process.env.LOCAL_STORAGE_DIR = dir;
  owner = await connect(ownerUrl());
  maria = await userId(owner, "maria.santos");
  submission = (await owner.query("SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE a.org_id = (SELECT org_id FROM app_user WHERE id = $1) LIMIT 1", [maria])).rows[0].id;
  await owner.query("INSERT INTO attachment (submission_id, path, filename, bytes, mime, uploaded_by) VALUES ($1, $2, 'kept.pdf', 1, 'application/pdf', $3)", [submission, kept, maria]);
});

afterAll(async () => {
  await owner?.query("DELETE FROM attachment WHERE path = $1", [kept]);
  await owner?.end();
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("[BR-012] orphan uploads are swept after 24 hours", () => {
  it("deletes old files with no attachment row and keeps referenced and recent ones", async () => {
    await put(kept, 48);
    await put(orphan, 48);
    await put(fresh, 1);
    const { withClaims, anonymous } = await import("@/lib/db");
    const { sweepOrphanFiles } = await import("@/lib/orphans");
    const scheduler = (await anonymous<{ id: string }>("SELECT app.ensure_scheduler() AS id"))[0].id;
    const result = await withClaims(scheduler, (tx) => sweepOrphanFiles(tx));
    expect(result.deleted).toBe(1);
    expect(await readdir(path.join(dir, "orphan-test"))).toEqual(["fresh.pdf", "kept.pdf"]);
  });

  it("is a no-op the second time", async () => {
    const { withClaims, anonymous } = await import("@/lib/db");
    const { sweepOrphanFiles } = await import("@/lib/orphans");
    const scheduler = (await anonymous<{ id: string }>("SELECT app.ensure_scheduler() AS id"))[0].id;
    expect((await withClaims(scheduler, (tx) => sweepOrphanFiles(tx))).deleted).toBe(0);
  });
});
