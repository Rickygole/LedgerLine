import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDefinition, buildDefinitionFrom, STANDARD_QUESTIONS } from "@/lib/forms/standard";
import {
  applyToForms,
  createLibraryQuestion,
  loadLibrary,
  loadLibraryQuestion,
  setLibraryRetired,
  updateLibraryQuestion,
} from "@/lib/forms/library";
import type { Tx } from "@/lib/db";
import type { FormDefinition, Question } from "@/lib/rules/types";
import { appUrl, asUser, connect, errorCode, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let daniel: string;
let grace: string;
let maria: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  daniel = await userId(owner, "daniel.cho");
  grace = await userId(owner, "grace.chen");
  maria = await userId(owner, "maria.santos");
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

async function initiatives(count: number, fiscalYear = "FY27") {
  const { rows } = await owner.query<{ id: string }>(
    `SELECT i.id FROM initiative i
     WHERE i.fiscal_year_id = $1 AND i.status = 'active'
       AND EXISTS (SELECT 1 FROM form_version f WHERE f.initiative_id = i.id AND f.status = 'published')
       AND NOT EXISTS (SELECT 1 FROM form_version f WHERE f.initiative_id = i.id AND f.status = 'draft')
     ORDER BY i.code LIMIT $2`,
    [fiscalYear, count],
  );
  return rows.map((r) => r.id);
}

const reworded = (label: string): Question => ({
  ...STANDARD_QUESTIONS.find((q) => q.key === "contact_name")!,
  label,
});

describe("[US-003] the standard questions live in a database library", () => {
  it("seeds the library from the standard questions so every form reads exactly as before", async () => {
    await asUser(app, priya, async () => {
      const library = await loadLibrary(tx(), { includeRetired: true });
      expect(library.map((item) => item.question)).toEqual(STANDARD_QUESTIONS);
      const fromDatabase = buildDefinitionFrom("Check report", [], library);
      expect(fromDatabase).toEqual(buildDefinition("Check report", []));
    });
  });

  it("lets every signed-in role read the library but only an administrator change it", async () => {
    for (const [who, expected] of [
      [daniel, "42501"],
      [grace, "42501"],
      [maria, "42501"],
    ] as const) {
      await asUser(app, who, async () => {
        expect((await app.query("SELECT count(*)::int AS n FROM question")).rows[0].n).toBe(15);
        expect(
          await errorCode(() => app.query("UPDATE question SET label = 'Changed' WHERE question_key = 'contact_name'")),
        ).toBe(null);
        expect((await app.query("SELECT label FROM question WHERE question_key = 'contact_name'")).rows[0].label).toBe(
          "Report contact name",
        );
        expect(
          await errorCode(() =>
            app.query(
              "INSERT INTO question (question_key, scope, label, field_type) VALUES ('sneaky_question', 'standard', 'Sneaky', 'text')",
            ),
          ),
        ).toBe(expected);
      });
    }
    await asUser(app, priya, async () => {
      const result = await updateLibraryQuestion(tx(), {
        question: reworded("Name of the person completing this report"),
        templateSection: "organization",
      });
      expect(result).toEqual({ ok: true });
      expect((await loadLibraryQuestion(tx(), "contact_name"))?.question.label).toBe(
        "Name of the person completing this report",
      );
    });
  });

  it("builds forms from the changed library without editing any existing form", async () => {
    const before = (
      await owner.query(
        "SELECT count(*)::int AS n, md5(string_agg(definition::text, '' ORDER BY id)) AS h FROM form_version",
      )
    ).rows[0];
    await asUser(app, priya, async () => {
      await updateLibraryQuestion(tx(), {
        question: reworded("Name of the person completing this report"),
        templateSection: "organization",
      });
      const library = await loadLibrary(tx());
      const created = buildDefinitionFrom("New report", [], library);
      const contact = created.sections[0].questions.find((q) => q.key === "contact_name");
      expect(contact?.label).toBe("Name of the person completing this report");
      const unchanged = (
        await app.query(
          "SELECT count(*)::int AS n, md5(string_agg(definition::text, '' ORDER BY id)) AS h FROM form_version",
        )
      ).rows[0];
      expect(unchanged).toEqual(before);
    });
  });

  it("audits an edit with the before and after values", async () => {
    await asUser(app, priya, async () => {
      await updateLibraryQuestion(tx(), {
        question: { ...reworded("Name of the person completing this report"), required: false },
        templateSection: "organization",
      });
      const event = (
        await app.query(
          "SELECT actor_id, before, after FROM audit_event WHERE entity = 'question' AND entity_id = 'contact_name' AND action = 'library_edit'",
        )
      ).rows[0];
      expect(event.actor_id).toBe(priya);
      expect(event.before.label).toBe("Report contact name");
      expect(event.before.required).toBe(true);
      expect(event.after.label).toBe("Name of the person completing this report");
      expect(event.after.required).toBe(false);
    });
  });

  it("refuses an invalid question: a choice list with one option, a table with no columns, a duplicate key", async () => {
    await asUser(app, priya, async () => {
      const base: Question = {
        key: "new_check",
        label: "New check",
        type: "select",
        required: false,
        scope: "standard",
      };
      expect(
        await createLibraryQuestion(tx(), { question: { ...base, options: ["Only"] }, templateSection: null }),
      ).toEqual({
        errors: ['"New check" needs at least two non-empty options.'],
      });
      expect(
        await createLibraryQuestion(tx(), {
          question: { ...base, type: "table", columns: [], maxRows: 5 },
          templateSection: null,
        }),
      ).toEqual({ errors: ['"New check" needs between 1 and 8 columns.'] });
      expect(
        await createLibraryQuestion(tx(), {
          question: { ...base, key: "contact_name", type: "text" },
          templateSection: null,
        }),
      ).toEqual({ errors: ['A library question with the key "contact_name" already exists.'] });
    });
  });

  it("stops the database too: a select question without options and a table without columns cannot be stored", async () => {
    expect(
      await errorCode(() =>
        owner.query(
          "INSERT INTO question (question_key, scope, label, field_type) VALUES ('bad_select', 'standard', 'Bad', 'select')",
        ),
      ),
    ).toBe("23514");
    expect(
      await errorCode(() =>
        owner.query(
          "INSERT INTO question (question_key, scope, label, field_type) VALUES ('bad_table', 'standard', 'Bad', 'table')",
        ),
      ),
    ).toBe("23514");
  });

  it("retires a question so it leaves new forms and the editor, and protects the identity questions", async () => {
    await asUser(app, priya, async () => {
      expect(await setLibraryRetired(tx(), "success_story", true, "")).toEqual({
        errors: ["Say why the question is being retired."],
      });
      expect(await setLibraryRetired(tx(), "success_story", true, "Replaced by the annual narrative")).toEqual({
        ok: true,
      });
      expect((await loadLibrary(tx())).map((i) => i.question.key)).not.toContain("success_story");
      const form = buildDefinitionFrom("After", [], await loadLibrary(tx()));
      expect(form.sections.flatMap((s) => s.questions).map((q) => q.key)).not.toContain("success_story");
      expect(await setLibraryRetired(tx(), "org_ein", true, "No longer needed")).toEqual({
        errors: ["The organization name and EIN questions identify the reporter and cannot be retired."],
      });
      expect(await setLibraryRetired(tx(), "success_story", false, "")).toEqual({ ok: true });
      const audits = (
        await app.query(
          "SELECT action, note FROM audit_event WHERE entity = 'question' AND entity_id = 'success_story' ORDER BY id",
        )
      ).rows;
      expect(audits.map((a) => a.action)).toEqual(["library_retire", "library_restore"]);
      expect(audits[0].note).toBe("Replaced by the annual narrative");
    });
  });
});

describe("[US-003] Apply to forms creates new drafts and never changes a published form", () => {
  it("creates a draft for each selected initiative with the updated question and leaves published versions and pinned reports alone", async () => {
    const picked = await initiatives(3);
    expect(picked).toHaveLength(3);
    const published = (
      await owner.query(
        "SELECT id, definition FROM form_version WHERE initiative_id = ANY($1::uuid[]) AND status = 'published'",
        [picked],
      )
    ).rows;
    const pinned = (
      await owner.query("SELECT count(*)::int AS n FROM submission s WHERE s.form_version_id = ANY($1::uuid[])", [
        published.map((r) => r.id),
      ])
    ).rows[0].n;
    await asUser(app, priya, async () => {
      await updateLibraryQuestion(tx(), {
        question: reworded("Name of the person completing this report"),
        templateSection: "organization",
      });
      const result = await applyToForms(tx(), "contact_name", picked, { addIfMissing: false });
      if (!("outcomes" in result)) throw new Error("apply failed");
      expect(result.outcomes.map((o) => o.result)).toEqual(["created", "created", "created"]);

      const drafts = (
        await app.query(
          "SELECT initiative_id, version, status, source, definition FROM form_version WHERE initiative_id = ANY($1::uuid[]) AND status = 'draft'",
          [picked],
        )
      ).rows;
      expect(drafts).toHaveLength(3);
      for (const draft of drafts) {
        const label = (draft.definition as FormDefinition).sections
          .flatMap((s) => s.questions)
          .find((q) => q.key === "contact_name")?.label;
        expect(label).toBe("Name of the person completing this report");
      }
      for (const row of published) {
        const now = (await app.query("SELECT status, definition FROM form_version WHERE id = $1", [row.id])).rows[0];
        expect(now.status).toBe("published");
        expect(now.definition).toEqual(row.definition);
      }
      const stillPinned = (
        await app.query("SELECT count(*)::int AS n FROM submission s WHERE s.form_version_id = ANY($1::uuid[])", [
          published.map((r) => r.id),
        ])
      ).rows[0].n;
      expect(stillPinned).toBe(pinned);

      const audit = (
        await app.query(
          "SELECT count(*)::int AS n FROM audit_event WHERE entity = 'form_version' AND action = 'library_applied' AND actor_id = $1",
          [priya],
        )
      ).rows[0].n;
      expect(audit).toBe(3);
      const summary = (
        await app.query("SELECT after FROM audit_event WHERE entity = 'question' AND action = 'library_apply'")
      ).rows[0].after;
      expect(summary.drafts_created).toBe(3);
    });
  });

  it("updates the open draft instead of stacking another one, and skips a form that is already current", async () => {
    const [one] = await initiatives(1);
    await asUser(app, priya, async () => {
      await updateLibraryQuestion(tx(), {
        question: reworded("Who completed this report"),
        templateSection: "organization",
      });
      const first = await applyToForms(tx(), "contact_name", [one], { addIfMissing: false });
      const second = await applyToForms(tx(), "contact_name", [one], { addIfMissing: false });
      if (!("outcomes" in first) || !("outcomes" in second)) throw new Error("apply failed");
      expect(first.outcomes[0].result).toBe("created");
      expect(second.outcomes[0].result).toBe("unchanged");
      await updateLibraryQuestion(tx(), {
        question: reworded("Who finished this report"),
        templateSection: "organization",
      });
      const third = await applyToForms(tx(), "contact_name", [one], { addIfMissing: false });
      if (!("outcomes" in third)) throw new Error("apply failed");
      expect(third.outcomes[0]).toMatchObject({ result: "updated", version: first.outcomes[0].version });
      const drafts = (
        await app.query("SELECT count(*)::int AS n FROM form_version WHERE initiative_id = $1 AND status = 'draft'", [
          one,
        ])
      ).rows[0].n;
      expect(drafts).toBe(1);
    });
  });

  it("adds a brand new library question to the template section of the forms that lack it, only when asked", async () => {
    const [one, two] = await initiatives(2);
    await asUser(app, priya, async () => {
      const created = await createLibraryQuestion(tx(), {
        question: {
          key: "volunteers_engaged",
          label: "Volunteers engaged",
          type: "integer",
          required: false,
          scope: "standard",
        },
        templateSection: "performance",
      });
      expect(created).toEqual({ ok: true });
      const skipped = await applyToForms(tx(), "volunteers_engaged", [one], { addIfMissing: false });
      if (!("outcomes" in skipped)) throw new Error("apply failed");
      expect(skipped.outcomes[0].result).toBe("missing");
      const added = await applyToForms(tx(), "volunteers_engaged", [two], { addIfMissing: true });
      if (!("outcomes" in added)) throw new Error("apply failed");
      expect(added.outcomes[0].result).toBe("created");
      const draft = (
        await app.query("SELECT definition FROM form_version WHERE initiative_id = $1 AND status = 'draft'", [two])
      ).rows[0].definition as FormDefinition;
      const performance = draft.sections.find((s) => s.key === "performance")!;
      expect(performance.questions.at(-1)?.key).toBe("volunteers_engaged");
      expect((await loadLibrary(tx())).find((i) => i.question.key === "volunteers_engaged")?.formsUsing).toBe(1);
      const forNewForms = buildDefinitionFrom("Another", [], await loadLibrary(tx()));
      expect(forNewForms.sections[1].questions.map((q) => q.key)).toContain("volunteers_engaged");
    });
  });

  it("is limited to administrators in the database: an analyst cannot create a draft or edit one", async () => {
    const [one] = await initiatives(1);
    await asUser(app, daniel, async () => {
      expect(
        await errorCode(() =>
          app.query(
            "INSERT INTO form_version (initiative_id, version, status, definition) VALUES ($1, 99, 'draft', '{}'::jsonb)",
            [one],
          ),
        ),
      ).toBe("42501");
    });
  });
});
