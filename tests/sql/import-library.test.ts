import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";
import { createLibraryQuestion, setLibraryRetired } from "@/lib/forms/library";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

vi.mock("server-only", () => ({}));

import { draftFormFromDocx } from "@/lib/ai/form-draft";

let owner: Client;
let app: Client;
let priya: string;
let initiative: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  initiative = (await owner.query("SELECT id FROM initiative WHERE fiscal_year_id = 'FY27' ORDER BY code LIMIT 1"))
    .rows[0].id;
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

function tx(): Tx {
  return {
    async query(sql, params) {
      return (await app.query(sql, params as unknown[])).rows;
    },
    async one(sql, params) {
      return (await app.query(sql, params as unknown[])).rows[0] ?? null;
    },
  };
}

const paragraphs = ["Garden Report", "1. Volunteer hours", "2. Describe the challenges you faced this year."];

describe("[US-003] the Word import reads the database question library", () => {
  it("links a template question to a library question added on the question library page", async () => {
    await asUser(app, priya, async () => {
      const before = await draftFormFromDocx({ tx: tx(), initiativeId: initiative, paragraphs });
      expect(before.fields.find((f) => f.field.label === "Volunteer hours")?.field.library_key).toBeUndefined();

      const created = await createLibraryQuestion(tx(), {
        question: {
          key: "volunteer_hours",
          label: "Volunteer hours",
          type: "integer",
          required: true,
          scope: "standard",
        },
        templateSection: "performance",
      });
      expect(created).toEqual({ ok: true });

      const after = await draftFormFromDocx({ tx: tx(), initiativeId: initiative, paragraphs });
      expect(after.library.map((item) => item.key)).toContain("volunteer_hours");
      const linked = after.fields.find((f) => f.field.label === "Volunteer hours");
      expect(linked?.field.library_key).toBe("volunteer_hours");
      expect(linked?.check.ok).toBe(true);
    });
  });

  it("stops offering a library question once it is retired", async () => {
    await asUser(app, priya, async () => {
      const result = await draftFormFromDocx({ tx: tx(), initiativeId: initiative, paragraphs });
      expect(result.fields.find((f) => f.field.label.startsWith("Describe the challenges"))?.field.library_key).toBe(
        "challenges",
      );
      expect(await setLibraryRetired(tx(), "challenges", true, "No longer collected")).toEqual({ ok: true });
      const retired = await draftFormFromDocx({ tx: tx(), initiativeId: initiative, paragraphs });
      expect(retired.library.map((item) => item.key)).not.toContain("challenges");
      expect(
        retired.fields.find((f) => f.field.label.startsWith("Describe the challenges"))?.field.library_key,
      ).toBeUndefined();
    });
  });
});
