import { describe, expect, it, vi } from "vitest";
import type { Tx } from "@/lib/db";

vi.mock("@/lib/forms/editor/definition", () => ({
  questionProblems: () => [],
  validateDefinition: () => [],
}));

import { publishDraftsWithQuestion } from "@/lib/forms/library";

const libraryRow = {
  question_key: "contact_name",
  label: "Contact",
  help: null,
  field_type: "text",
  required: true,
  options: null,
  max_length: null,
  max_words: null,
  visible_when: null,
  table_columns: null,
  max_rows: null,
  sum_rule: null,
  template_section: "organization",
  position: 1,
  retired_at: null,
  updated_at: "2026-01-01",
  updated_by_name: null,
  forms_using: 2,
  usage_by_year: {},
};

function fakeTx(failOn: number) {
  const log: string[] = [];
  let publishes = 0;
  const tx: Tx = {
    async query(sql) {
      log.push(sql.trim().split("\n")[0].slice(0, 40));
      if (sql.includes("FROM form_version f JOIN initiative")) {
        return [
          { id: "a", version: 2, initiative_id: "ia", name: "First" },
          { id: "b", version: 3, initiative_id: "ib", name: "Second" },
          { id: "c", version: 4, initiative_id: "ic", name: "Third" },
        ] as never;
      }
      return [];
    },
    async one(sql) {
      log.push(sql.trim().split("\n")[0].slice(0, 40));
      if (sql.includes("q.question_key = $1")) return libraryRow as never;
      if (sql.includes("SELECT definition")) return { definition: { sections: [] } } as never;
      if (sql.includes("app.publish_form")) {
        publishes += 1;
        if (publishes === failOn)
          throw Object.assign(new Error("publishing requires a finance admin"), { code: "42501" });
        return { version: 1 } as never;
      }
      return null;
    },
  };
  return { tx, log };
}

describe("[US-003] Publish all drafts when privilege is lost mid-batch", () => {
  it("rethrows insufficient privilege after rolling back its savepoint and writes no summary", async () => {
    const { tx, log } = fakeTx(2);
    const error = await publishDraftsWithQuestion(tx, "contact_name", null).catch((e: unknown) => e);
    expect((error as { code?: string }).code).toBe("42501");
    expect(log).toContain("ROLLBACK TO SAVEPOINT publish_one");
    expect(log.filter((entry) => entry.startsWith("SELECT app.publish_form"))).toHaveLength(2);
    expect(log.some((entry) => entry.startsWith("SELECT app.write_audit"))).toBe(false);
  });
});
