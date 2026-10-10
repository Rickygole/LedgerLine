import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyPreset } from "../../scripts/presets";
import { connect, ownerUrl } from "./helpers";

let owner: Client;

beforeAll(async () => {
  owner = await connect(ownerUrl());
});

afterAll(async () => {
  await owner?.end();
});

async function inRolledBackTransaction(fn: () => Promise<void>) {
  await owner.query("BEGIN");
  try {
    await fn();
  } finally {
    await owner.query("ROLLBACK");
  }
}

async function mariaDraft() {
  const { rows } = await owner.query<{ id: string }>(
    `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN initiative i ON i.id = a.initiative_id JOIN organization o ON o.id = a.org_id
     WHERE o.ein = '13-4027118' AND i.name = 'Mentor Match Network' AND s.period_id = 'FY26-YE'`,
  );
  return rows[0].id;
}

async function picture(id: string) {
  const sub = (
    await owner.query("SELECT status, revision, lock_version, submitted_at FROM submission WHERE id = $1", [id])
  ).rows[0];
  const answers = (
    await owner.query("SELECT question_key FROM answer WHERE submission_id = $1 ORDER BY 1", [id])
  ).rows.map((r) => r.question_key);
  const lines = (await owner.query("SELECT count(*)::int AS n FROM budget_line WHERE submission_id = $1", [id])).rows[0]
    .n;
  const revisions = (
    await owner.query("SELECT count(*)::int AS n FROM submission_revision WHERE submission_id = $1", [id])
  ).rows[0].n;
  const mail = (await owner.query("SELECT count(*)::int AS n FROM outbox WHERE submission_id = $1", [id])).rows[0].n;
  return { sub, answers, lines, revisions, mail };
}

describe("demo scenes reset only their own rows and are idempotent", () => {
  it("puts Maria's overdue draft back to half filled with an empty budget, twice with the same result", async () => {
    await inRolledBackTransaction(async () => {
      const id = await mariaDraft();
      await owner.query(
        "INSERT INTO budget_line (submission_id, row_id, position, category, description, amount) VALUES ($1, gen_random_uuid(), 1, 'PS', 'Added in a demo', 100)",
        [id],
      );
      await owner.query(
        "INSERT INTO answer (submission_id, question_key, value) VALUES ($1, 'extra_demo_key', '\"x\"') ON CONFLICT DO NOTHING",
        [id],
      );
      const otherBefore = (
        await owner.query("SELECT count(*)::int AS n, sum(revision)::int AS r FROM submission WHERE id <> $1", [id])
      ).rows[0];
      await applyPreset(owner, "maria", { ownTransaction: false });
      const first = await picture(id);
      await applyPreset(owner, "maria", { ownTransaction: false });
      expect(await picture(id)).toEqual(first);
      expect(first.sub).toMatchObject({ status: "draft", revision: 0, submitted_at: null });
      expect(first.lines).toBe(0);
      expect(first.answers).toContain("accomplishments");
      expect(first.answers).not.toContain("extra_demo_key");
      expect(
        (await owner.query("SELECT count(*)::int AS n, sum(revision)::int AS r FROM submission WHERE id <> $1", [id]))
          .rows[0],
      ).toEqual(otherBefore);
      expect(
        (await owner.query("SELECT count(*)::int AS n FROM demo_reset WHERE scene = 'maria'")).rows[0].n,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it("puts one of Maria's reports under review with exactly one open flag, twice with the same result", async () => {
    await inRolledBackTransaction(async () => {
      const { rows } = await owner.query<{ id: string }>(
        `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN initiative i ON i.id = a.initiative_id JOIN organization o ON o.id = a.org_id
         WHERE o.ein = '13-4027118' AND i.name = 'Afterschool Studio Program' AND s.period_id = 'FY26-YE'`,
      );
      const id = rows[0].id;
      await applyPreset(owner, "daniel", { ownTransaction: false });
      const first = await picture(id);
      const flags = async () =>
        (await owner.query("SELECT status, kind FROM flag WHERE submission_id = $1", [id])).rows;
      expect(await flags()).toEqual([{ status: "open", kind: "manual" }]);
      await applyPreset(owner, "daniel", { ownTransaction: false });
      expect(await picture(id)).toEqual(first);
      expect(await flags()).toHaveLength(1);
      expect(first.sub.status).toBe("under_review");
      expect(first.mail).toBe(1);
    });
  });

  it("removes initiatives created since the last reseed and leaves the seeded ones", async () => {
    await inRolledBackTransaction(async () => {
      const seeded = (await owner.query("SELECT count(*)::int AS n FROM initiative")).rows[0].n;
      const fy = (await owner.query("SELECT id FROM fiscal_year ORDER BY id DESC LIMIT 1")).rows[0].id;
      const org = (await owner.query("SELECT id FROM organization LIMIT 1")).rows[0].id;
      const made = (
        await owner.query(
          "INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding) VALUES ('ZZ-DEMO-1', 'Demo created initiative', 'Youth Services', 'Created in a demo', $1, 1000) RETURNING id",
          [fy],
        )
      ).rows[0].id;
      await owner.query("INSERT INTO assignment (initiative_id, org_id, award_amount) VALUES ($1, $2, 1000)", [
        made,
        org,
      ]);
      expect((await owner.query("SELECT count(*)::int AS n FROM initiative")).rows[0].n).toBe(seeded + 1);
      await applyPreset(owner, "priya", { ownTransaction: false });
      expect((await owner.query("SELECT count(*)::int AS n FROM initiative")).rows[0].n).toBe(seeded);
      expect(
        (await owner.query("SELECT count(*)::int AS n FROM assignment WHERE initiative_id = $1", [made])).rows[0].n,
      ).toBe(0);
      await applyPreset(owner, "priya", { ownTransaction: false });
      expect((await owner.query("SELECT count(*)::int AS n FROM initiative")).rows[0].n).toBe(seeded);
    });
  });
});
