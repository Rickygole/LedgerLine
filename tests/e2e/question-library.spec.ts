import { expect, test } from "@playwright/test";
import { authFile, PEOPLE } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

const LABEL = "Volunteers engaged this period";
const RENAMED = "Volunteers who served this period";
let key = "";
let first: { id: string; name: string } | null = null;
let second: { id: string; name: string } | null = null;
let third: { id: string; name: string } | null = null;
let secondDraft = "";

async function pickInitiatives() {
  const rows = await ownerQuery<{ id: string; name: string }>(
    `SELECT i.id, i.name FROM initiative i
     WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active'
       AND EXISTS (SELECT 1 FROM form_version f WHERE f.initiative_id = i.id AND f.status = 'published')
       AND NOT EXISTS (SELECT 1 FROM form_version f WHERE f.initiative_id = i.id AND f.status = 'draft')
     ORDER BY i.code DESC LIMIT 3`,
  );
  first = rows[0];
  second = rows[1];
  third = rows[2];
}

test.describe("as an administrator", () => {
  test.use({ storageState: authFile("priya") });

  test.afterAll(async () => {
    const ids = [first, second, third].filter(Boolean).map((row) => row!.id);
    if (ids.length > 0)
      await ownerQuery("DELETE FROM form_version WHERE initiative_id = ANY($1::uuid[]) AND status = 'draft'", [ids]);
    if (key) await ownerQuery("DELETE FROM question WHERE question_key = $1", [key]);
  });

  test("[US-003] the Finance nav links to the question library, which lists the standard questions from the database", async ({
    page,
  }) => {
    await page.goto("/finance");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Question library" }).click();
    await expect(page).toHaveURL(/\/finance\/question-library$/);
    await expect(page.getByRole("heading", { name: "Question library", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Organization legal name" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Participants under 18 by age group" })).toBeVisible();
    const [row] = await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM question WHERE scope = 'standard'");
    expect(row.n).toBeGreaterThanOrEqual(15);
    await expect(page.getByRole("link", { name: "Add a question" })).toBeVisible();
    const legal = page.getByRole("row", { name: /Organization legal name/ });
    await expect(legal).toContainText(/\d+ in FY27/);
    await expect(legal).toContainText(/\d+ in FY26/);
    const [fy27] = await ownerQuery<{ n: number }>(
      `SELECT count(DISTINCT f.initiative_id)::int AS n FROM form_version f JOIN initiative i ON i.id = f.initiative_id
       WHERE i.fiscal_year_id = 'FY27' AND f.status IN ('published', 'draft')
         AND jsonb_path_exists(f.definition, '$.sections[*].questions[*] ? (@.key == "org_legal_name")')`,
    );
    await expect(legal).toContainText(`${fy27.n} in FY27`);
  });

  test("[US-003] an administrator adds a library question and then changes its wording", async ({ page }) => {
    await page.goto("/finance/question-library/new");
    await page.getByLabel("Label", { exact: true }).fill(LABEL);
    await page.getByLabel("Answer type").selectOption("integer");
    await page.getByLabel("Starts in new forms").selectOption("performance");
    await page.getByRole("button", { name: "Add to library" }).click();
    await page.waitForURL(/\/finance\/question-library\/[a-z0-9_]+\?added=1$/);
    key = new URL(page.url()).pathname.split("/").pop() as string;
    await expect(page.getByText("Question added to the library.")).toBeVisible();
    const [row] = await ownerQuery<{ label: string; field_type: string; template_section: string; scope: string }>(
      "SELECT label, field_type, template_section, scope FROM question WHERE question_key = $1",
      [key],
    );
    expect(row).toEqual({ label: LABEL, field_type: "integer", template_section: "performance", scope: "standard" });

    await page.getByLabel("Label", { exact: true }).fill(RENAMED);
    await page.getByRole("button", { name: "Save question" }).click();
    await expect(page.getByText(/Question saved\./)).toBeVisible();
    const [saved] = await ownerQuery<{ label: string }>("SELECT label FROM question WHERE question_key = $1", [key]);
    expect(saved.label).toBe(RENAMED);
    const audits = await ownerQuery<{ action: string }>(
      "SELECT action FROM audit_event WHERE entity = 'question' AND entity_id = $1 ORDER BY id",
      [key],
    );
    expect(audits.map((a) => a.action)).toEqual(["library_add", "library_edit"]);
  });

  test("[US-003] Apply to forms creates a new draft for the chosen initiative and leaves its published form alone", async ({
    page,
  }) => {
    await pickInitiatives();
    const [before] = await ownerQuery<{ definition: unknown; version: number }>(
      "SELECT definition, version FROM form_version WHERE initiative_id = $1 AND status = 'published'",
      [first!.id],
    );
    await page.goto(`/finance/question-library/${key}`);
    await page.getByLabel("Fiscal year").selectOption("FY27");
    await page.getByLabel("Find an initiative").fill(first!.name);
    const option = page.getByRole("checkbox", { name: new RegExp(first!.name) });
    await expect(option).toHaveAccessibleName(/\S CI-\d{2}-\d+/);
    await option.check();
    await page.getByLabel("Also add the question to forms that do not have it").check();
    await page.getByRole("button", { name: "Apply to 1 form" }).click();
    await expect(page.getByText(/1 new draft created/)).toBeVisible();

    const drafts = await ownerQuery<{
      version: number;
      definition: { sections: { questions: { key: string; label: string }[] }[] };
    }>("SELECT version, definition FROM form_version WHERE initiative_id = $1 AND status = 'draft'", [first!.id]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].version).toBe(before.version + 1);
    const labels = drafts[0].definition.sections.flatMap((s) => s.questions.map((q) => q.label));
    expect(labels).toContain(RENAMED);
    const [after] = await ownerQuery<{ definition: unknown }>(
      "SELECT definition FROM form_version WHERE initiative_id = $1 AND status = 'published'",
      [first!.id],
    );
    expect(after.definition).toEqual(before.definition);
    const [audit] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_event WHERE entity = 'form_version' AND action = 'library_applied' AND after ->> 'question_key' = $1",
      [key],
    );
    expect(audit.n).toBe(1);
  });

  test("[US-003] Publish all drafts publishes what Apply to forms created in one confirmed step", async ({ page }) => {
    const picked = await ownerQuery<{ id: string; name: string; version: number; form_id: string }>(
      `SELECT i.id, i.name, f.version, f.id AS form_id FROM initiative i
       JOIN form_version f ON f.initiative_id = i.id AND f.status = 'published'
       WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM form_version d WHERE d.initiative_id = i.id AND d.status = 'draft')
       ORDER BY i.code LIMIT 2`,
    );
    expect(picked).toHaveLength(2);
    await page.goto(`/finance/question-library/${key}`);
    await expect(page.getByText(/1 draft with this question is waiting to be published/)).toBeVisible();
    await page.getByLabel("Fiscal year").selectOption("FY27");
    for (const row of picked) {
      await page.getByLabel("Find an initiative").fill(row.name);
      await page.getByRole("checkbox", { name: new RegExp(row.name) }).check();
    }
    await page.getByLabel("Also add the question to forms that do not have it").check();
    await page.getByRole("button", { name: "Apply to 2 forms" }).click();
    await expect(page.getByText(/2 new drafts created/)).toBeVisible();
    await page.getByRole("button", { name: "Publish all 2 drafts" }).click();
    const dialog = page.getByRole("dialog", { name: "Publish 2 drafts?" });
    await expect(dialog).toContainText("2 forms will get a new version.");
    await expect(dialog).toContainText("Reports already started keep their version.");
    await dialog.getByRole("button", { name: "Yes, publish 2 drafts" }).click();
    await expect(page.getByText("2 forms published as a new version.")).toBeVisible();
    for (const row of picked) {
      const versions = await ownerQuery<{ version: number; status: string }>(
        "SELECT version, status FROM form_version WHERE initiative_id = $1 AND status IN ('published', 'draft') ORDER BY version",
        [row.id],
      );
      expect(versions).toEqual([{ version: row.version + 1, status: "published" }]);
      const [old] = await ownerQuery<{ status: string }>("SELECT status FROM form_version WHERE id = $1", [
        row.form_id,
      ]);
      expect(old.status).toBe("superseded");
    }
    const [audit] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_event WHERE entity = 'question' AND entity_id = $1 AND action = 'library_publish'",
      [key],
    );
    expect(audit.n).toBe(1);
  });

  test("[US-003] the form editor's Add from library reads the database library and honors a retired question", async ({
    page,
  }) => {
    const [draft] = await ownerQuery<{ id: string }>(
      `INSERT INTO form_version (initiative_id, version, status, definition, source, created_by)
       SELECT f.initiative_id, f.version + 1, 'draft', f.definition, 'manual', (SELECT id FROM app_user WHERE email = $2)
       FROM form_version f WHERE f.initiative_id = $1 AND f.status = 'published' RETURNING id`,
      [second!.id, PEOPLE.priya],
    );
    secondDraft = draft.id;
    await page.goto(`/finance/forms/${secondDraft}`);
    await page.getByLabel("Standard question").selectOption({ label: RENAMED });
    await page.getByRole("button", { name: "Add from library" }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();
    const [saved] = await ownerQuery<{ definition: { sections: { questions: { key: string; scope: string }[] }[] } }>(
      "SELECT definition FROM form_version WHERE id = $1",
      [secondDraft],
    );
    const added = saved.definition.sections.flatMap((s) => s.questions).find((q) => q.key === key);
    expect(added?.scope).toBe("standard");

    await page.goto(`/finance/question-library/${key}`);
    await page.getByLabel("Reason").fill("Replaced by the annual volunteer survey");
    await page.getByRole("button", { name: "Retire question" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Question retired." })).toBeVisible();
    await expect(page.getByText("Retired", { exact: true }).first()).toBeVisible();
    const [row] = await ownerQuery<{ retired_at: string | null }>(
      "SELECT retired_at FROM question WHERE question_key = $1",
      [key],
    );
    expect(row.retired_at).not.toBeNull();
    const [other] = await ownerQuery<{ id: string }>(
      `INSERT INTO form_version (initiative_id, version, status, definition, source, created_by)
       SELECT f.initiative_id, f.version + 1, 'draft', f.definition, 'manual', (SELECT id FROM app_user WHERE email = $2)
       FROM form_version f WHERE f.initiative_id = $1 AND f.status = 'published' RETURNING id`,
      [third!.id, PEOPLE.priya],
    );
    await page.goto(`/finance/forms/${other.id}`);
    await expect(page.getByLabel("Standard question").locator("option", { hasText: RENAMED })).toHaveCount(0);
  });
});

test.describe("as view-only Finance staff", () => {
  test.use({ storageState: authFile("grace") });

  test("[US-003] the library can be read but not changed", async ({ page }) => {
    await page.goto("/finance/question-library");
    await expect(page.getByRole("heading", { name: "Question library", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a question" })).toHaveCount(0);
    await page.getByRole("link", { name: "Report contact name" }).click();
    await expect(page.getByText("Only finance administrators can change the question library.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save question" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Apply to/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Publish all/ })).toHaveCount(0);
    const response = await page.goto("/finance/question-library/new");
    expect(response?.status()).toBe(403);
  });
});
