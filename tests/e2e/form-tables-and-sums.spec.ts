import { expect, test } from "@playwright/test";
import { authFile, PEOPLE } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("priya") });

let draftId = "";

test.beforeAll(async () => {
  const [draft] = await ownerQuery<{ id: string }>(
    `INSERT INTO form_version (initiative_id, version, status, definition, source, created_by)
     SELECT f.initiative_id, f.version + 1, 'draft', f.definition, 'manual', (SELECT id FROM app_user WHERE email = $1)
     FROM form_version f JOIN initiative i ON i.id = f.initiative_id
     WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active' AND f.status = 'published'
       AND NOT EXISTS (SELECT 1 FROM form_version d WHERE d.initiative_id = f.initiative_id AND d.status = 'draft')
       AND NOT EXISTS (SELECT 1 FROM assignment a JOIN app_user u ON u.org_id = a.org_id WHERE a.initiative_id = f.initiative_id AND u.email LIKE 'maria%')
     ORDER BY i.code DESC LIMIT 1 RETURNING id`,
    [PEOPLE.priya],
  );
  draftId = draft.id;
});

test.afterAll(async () => {
  await ownerQuery("DELETE FROM form_version WHERE id = $1 AND status = 'draft'", [draftId]);
});

type Saved = {
  sumRules?: { key: string; fields: string[]; target: number | string }[];
  sections: {
    questions: {
      key: string;
      label: string;
      type: string;
      maxRows?: number;
      columns?: { key: string; label: string; type: string }[];
      sumRule?: { column: string; target: number | string };
    }[];
  }[];
};

test("[US-007] a table is added from the question types, with its own columns and row limit", async ({ page }) => {
  await page.goto(`/finance/forms/${draftId}`);
  await page.getByLabel("Question label").fill("Spending by site");
  await page.getByLabel("Answer type").selectOption("table");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByRole("button", { name: /details for question \d+, Spending by site/ }).click();
  const card = page.locator("#question-spending_by_site");
  await card.getByLabel("Column 1 label").fill("Site");
  await card.getByLabel("Column 2 label").fill("Cost");
  await card.getByLabel("Column 2 type").selectOption("currency");
  await card.getByRole("button", { name: "Add column" }).click();
  await card.getByLabel("Column 3 label").fill("Visits");
  await card.getByLabel("Column 3 type").selectOption("integer");
  await card.getByLabel("Maximum rows").fill("4");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();

  const [row] = await ownerQuery<{ definition: Saved }>("SELECT definition FROM form_version WHERE id = $1", [draftId]);
  const table = row.definition.sections.flatMap((s) => s.questions).find((q) => q.key === "spending_by_site");
  expect(table?.type).toBe("table");
  expect(table?.maxRows).toBe(4);
  expect(table?.columns?.map((c) => [c.label, c.type])).toEqual([
    ["Site", "text"],
    ["Cost", "currency"],
    ["Visits", "integer"],
  ]);

  await page.getByRole("tab", { name: "Preview as organization" }).click();
  await expect(page.getByText("Spending by site").first()).toBeVisible();
  await expect(page.getByText("Cost").first()).toBeVisible();
});

test("[US-027] a table column can be required to add up to the award", async ({ page }) => {
  await page.goto(`/finance/forms/${draftId}`);
  await page.getByRole("button", { name: /details for question \d+, Spending by site/ }).click();
  const card = page.locator("#question-spending_by_site");
  await card.getByLabel("Column that must add up").selectOption({ label: "Cost" });
  await card.getByLabel("Must equal").selectOption("award");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  const [row] = await ownerQuery<{ definition: Saved }>("SELECT definition FROM form_version WHERE id = $1", [draftId]);
  const table = row.definition.sections.flatMap((s) => s.questions).find((q) => q.key === "spending_by_site");
  expect(table?.sumRule).toEqual({ column: table?.columns?.[1].key, target: "award" });
  expect(table?.columns?.[1].label).toBe("Cost");
});

test("[US-027] a group of number questions can be required to add up to a fixed number", async ({ page }) => {
  await page.goto(`/finance/forms/${draftId}`);
  for (const label of ["Served in the north", "Served in the south"]) {
    await page.getByLabel("Question label").fill(label);
    await page.getByLabel("Answer type").selectOption("integer");
    await page.getByRole("button", { name: "Add question" }).click();
  }
  const group = page.getByRole("group", { name: "Questions that must add up" });
  await group.getByRole("checkbox", { name: "Served in the north" }).check();
  await expect(page.getByRole("button", { name: "Add sum rule" })).toBeDisabled();
  await group.getByRole("checkbox", { name: "Served in the south" }).check();
  await page.getByLabel("Number", { exact: true }).fill("-5");
  await expect(page.getByRole("alert").filter({ hasText: "cannot add up to a negative number" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add sum rule" })).toBeDisabled();
  await page.getByLabel("Number", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Add sum rule" }).click();
  await expect(page.getByText("Served in the north, Served in the south must add up to 100.")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  const [row] = await ownerQuery<{ definition: Saved }>("SELECT definition FROM form_version WHERE id = $1", [draftId]);
  expect(row.definition.sumRules).toEqual([
    { key: "sum_rule_1", fields: ["served_in_the_north", "served_in_the_south"], target: 100 },
  ]);
});

test("[US-003] a form cannot be saved with two questions that have the same label", async ({ page }) => {
  await page.goto(`/finance/forms/${draftId}`);
  await page.getByLabel("Question label").fill("Served in the north");
  await page.getByLabel("Answer type").selectOption("integer");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText('Two questions are labeled "Served in the north". Give each question its own label.'),
  ).toBeVisible();
  const [row] = await ownerQuery<{ definition: Saved }>("SELECT definition FROM form_version WHERE id = $1", [draftId]);
  const labels = row.definition.sections.flatMap((s) => s.questions).filter((q) => q.label === "Served in the north");
  expect(labels).toHaveLength(1);
});

test("[US-027] a sum rule that cannot be checked is refused when the draft is saved", async ({ page }) => {
  await page.goto(`/finance/forms/${draftId}`);
  await page.getByRole("button", { name: /details for question \d+, Served in the north/ }).click();
  await page.locator("#question-served_in_the_north").getByLabel("Answer type").selectOption("text");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByText('"Sum rule sum_rule_1" can only add up number, whole number, dollar and percent questions.'),
  ).toBeVisible();
  const [row] = await ownerQuery<{ definition: Saved }>("SELECT definition FROM form_version WHERE id = $1", [draftId]);
  const north = row.definition.sections.flatMap((s) => s.questions).find((q) => q.key === "served_in_the_north");
  expect(north?.type).toBe("integer");
});
