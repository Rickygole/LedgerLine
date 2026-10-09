import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("priya") });

const NAME = "Neighborhood Tutoring Network";
let initiativeId = "";

test("[US-001] an administrator creates a new initiative without a code change", async ({ page }) => {
  await page.goto("/finance/initiatives/new");
  await page.getByLabel("Initiative name").fill(NAME);
  await page.getByLabel("Category").selectOption({ index: 1 });
  await page.getByLabel("Description").fill("After-school tutoring in reading and math for students in grades 3 to 8.");
  await page.getByRole("button", { name: /Create|Continue|Save/ }).first().click();
  await page.waitForURL(/initiative=[0-9a-f-]{36}/);
  initiativeId = new URL(page.url()).searchParams.get("initiative") as string;
  const [row] = await ownerQuery<{ name: string; status: string }>("SELECT name, status FROM initiative WHERE id = $1", [initiativeId]);
  expect(row.name).toBe(NAME);
});

test("[US-002] the initiative is funded for an organization and given a report form", async ({ page }) => {
  await page.goto(`/finance/initiatives/new?initiative=${initiativeId}`);
  await page.getByLabel("Find an organization").fill("a");
  await page.getByRole("button", { name: /^Add / }).first().click();
  await page.getByLabel(/amount/i).first().fill("40000");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await page.waitForURL(/step=3/);
  const assigned = await ownerQuery<{ award_amount: string }>("SELECT award_amount FROM assignment WHERE initiative_id = $1", [initiativeId]);
  expect(assigned).toHaveLength(1);
  expect(Number(assigned[0].award_amount)).toBe(40000);
  await page.getByRole("button", { name: "Use the standard template" }).click();
  await page.waitForURL(/\/finance\/forms\/[0-9a-f-]{36}/);
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeVisible();
});

test("[US-004] an initiative-specific question is added next to the shared standard questions and the form is published", async ({ page }) => {
  await page.goto(`/finance/initiatives/${initiativeId}`);
  const [draft] = await ownerQuery<{ id: string }>("SELECT id FROM form_version WHERE initiative_id = $1 AND status = 'draft'", [initiativeId]);
  await page.goto(`/finance/forms/${draft.id}`);
  await page.getByLabel("Question label").fill("Students tutored in grade 3 to 8");
  await page.getByLabel("Answer type").selectOption("integer");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish version 1" }).click();
  await expect(page.getByText("Version 1 is published.")).toBeVisible();
  const [form] = await ownerQuery<{ status: string; definition: { sections: { questions: { key: string; label: string }[] }[] } }>(
    "SELECT status, definition FROM form_version WHERE id = $1",
    [draft.id]
  );
  expect(form.status).toBe("published");
  const labels = form.definition.sections.flatMap((s) => s.questions.map((q) => q.label));
  expect(labels).toContain("Students tutored in grade 3 to 8");
  expect(labels).toContain("Organization legal name");
  const [audit] = await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM audit_event WHERE entity = 'form_version' AND entity_id = $1 AND action = 'publish'", [draft.id]);
  expect(audit.n).toBe(1);
});

test("an analyst cannot open the new initiative page", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("daniel") });
  const page = await context.newPage();
  const response = await page.goto("/finance/initiatives/new");
  expect(response?.status()).toBe(404);
  await context.close();
});
