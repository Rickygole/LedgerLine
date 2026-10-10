import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";
import { connect, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

let owner: Client;
let maria: string;
let daniel: string;
let submissionId: string;

function txOver(client: Client): Tx {
  return {
    async query(sql, params = []) {
      return (await client.query(sql, params)).rows;
    },
    async one(sql, params = []) {
      return (await client.query(sql, params)).rows[0] ?? null;
    },
  };
}

async function actAs(user: string) {
  await owner.query("RESET ROLE");
  await owner.query("SET LOCAL ROLE app_server");
  await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
}

beforeAll(async () => {
  owner = await connect(ownerUrl());
  maria = await userId(owner, "maria.santos");
  daniel = await userId(owner, "daniel.cho");
});

afterAll(async () => {
  await owner?.end();
});

describe("[BR-019][US-056] files sent with a submitted revision stay available", () => {
  it("keeps the file row after the organization removes it from a returned report", async () => {
    const { removeAttachmentRow } = await import("@/lib/report/attachments");
    await owner.query("BEGIN");
    try {
      submissionId = (
        await owner.query(
          `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN app_user u ON u.org_id = a.org_id
           WHERE u.id = $1 AND s.status = 'draft' LIMIT 1`,
          [maria],
        )
      ).rows[0].id;
      await owner.query(
        "UPDATE submission SET status = 'returned', revision = 1, submitted_at = now(), submitted_by = $2 WHERE id = $1",
        [submissionId, maria],
      );
      const sent = (
        await owner.query(
          "INSERT INTO attachment (submission_id, path, filename, bytes, mime, uploaded_by) VALUES ($1, '00-1040217/hist/sent.pdf', 'signed-certification.pdf', 2048, 'application/pdf', $2) RETURNING id",
          [submissionId, maria],
        )
      ).rows[0].id;
      const unsent = (
        await owner.query(
          "INSERT INTO attachment (submission_id, path, filename, bytes, mime, uploaded_by) VALUES ($1, '00-1040217/hist/draft.pdf', 'notes.pdf', 1024, 'application/pdf', $2) RETURNING id",
          [submissionId, maria],
        )
      ).rows[0].id;
      const snapshot = {
        formVersionId: "f",
        answers: {},
        budget: [],
        attachments: [
          {
            path: "00-1040217/hist/sent.pdf",
            filename: "signed-certification.pdf",
            bytes: 2048,
            mime: "application/pdf",
          },
        ],
      };
      await owner.query(
        "INSERT INTO submission_revision (submission_id, revision, kind, snapshot, sha256, actor) VALUES ($1, 1, 'submit', $2::jsonb, 'abc', $3)",
        [submissionId, JSON.stringify(snapshot), maria],
      );

      await actAs(maria);
      expect(await removeAttachmentRow(txOver(owner), submissionId, sent)).toBe(1);
      expect(await removeAttachmentRow(txOver(owner), submissionId, unsent)).toBe(1);

      const rows = (
        await owner.query(
          "SELECT id, removed_at FROM attachment WHERE submission_id = $1 AND path LIKE '00-1040217/hist/%'",
          [submissionId],
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(sent);
      expect(rows[0].removed_at).not.toBeNull();

      await actAs(daniel);
      const visible = (
        await owner.query("SELECT id FROM attachment WHERE id = $1 AND submission_id = $2", [sent, submissionId])
      ).rows;
      expect(visible).toHaveLength(1);
    } finally {
      await owner.query("RESET ROLE");
      await owner.query("ROLLBACK");
    }
  });
});
