import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { authFile, gotoStep, PEOPLE, savedNow, stepLink } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

async function openAnyDraft(page: Page): Promise<string> {
  const [draft] = await ownerQuery<{ id: string }>(
    `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE s.status = 'draft' AND a.org_id = (SELECT org_id FROM app_user WHERE email = $1) ORDER BY s.reference_no LIMIT 1`,
    [PEOPLE.maria],
  );
  await page.goto(`/portal/reports/${draft.id}`);
  await expect(page.getByRole("navigation", { name: "Report sections" })).toBeVisible();
  return draft.id;
}

test("[BR-009][US-016] a start link that pairs an initiative with another year's period is not found and creates nothing", async ({
  browser,
}) => {
  const [cross] = await ownerQuery<{ assignment_id: string; period_id: string }>(
    `SELECT a.id AS assignment_id, p.id AS period_id
     FROM assignment a JOIN initiative i ON i.id = a.initiative_id
     JOIN reporting_period p ON p.fiscal_year_id <> i.fiscal_year_id
     WHERE a.org_id = (SELECT org_id FROM app_user WHERE email = $1)
       AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = p.id)
     LIMIT 1`,
    [PEOPLE.maria],
  );
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("maria"),
  });
  const page = await context.newPage();
  const response = await page.goto(`/portal/reports/new?assignment=${cross.assignment_id}&period=${cross.period_id}`);
  expect(response?.status()).toBe(404);
  const rows = await ownerQuery("SELECT 1 FROM submission WHERE assignment_id = $1 AND period_id = $2", [
    cross.assignment_id,
    cross.period_id,
  ]);
  expect(rows).toHaveLength(0);
  await context.close();
});

test("[BR-021][US-031] a required table with only an empty row is refused", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("maria"),
  });
  const page = await context.newPage();
  await openAnyDraft(page);
  await gotoStep(page, "Program performance");
  await page.getByRole("radio", { name: "Yes", exact: true }).first().check();
  const filled = page.getByRole("button", { name: /^Remove row 1 from / });
  while ((await filled.count()) > 0) await filled.first().click();
  await page.getByRole("button", { name: "Add row" }).first().click();
  await gotoStep(page, "Review and submit");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(
    page.getByRole("alert").getByText("Fill in the participants under 18 by age group table.").first(),
  ).toBeVisible();
  await context.close();
});

test("[US-018] reopening a report lands on the section edited last", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("maria"),
  });
  const page = await context.newPage();
  const id = await openAnyDraft(page);
  await gotoStep(page, "Narrative");
  await page.locator("#q-accomplishments").fill("Participants completed the curriculum.");
  await expect(savedNow(page)).toBeVisible({ timeout: 20_000 });
  await gotoStep(page, "Organization and contact");
  await page.goto(`/portal/reports/${id}`);
  await expect(page.locator("#step-heading")).toHaveText("Narrative");
  await expect(stepLink(page, "Narrative")).toHaveAttribute("aria-current", "step");
  await expect(page.getByText("Pick up where you left off")).toHaveCount(0);
  await expect(page.locator("#q-accomplishments")).toHaveValue("Participants completed the curriculum.");
  await context.close();
});

test("[US-029] number, whole-number and percent fields refuse letters as typed and normalize a pasted amount", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("maria"),
  });
  const page = await context.newPage();
  await openAnyDraft(page);
  await gotoStep(page, "Program performance");
  const whole = page.locator("#q-participants_target");
  await whole.fill("");
  await whole.pressSequentially("1a2b3");
  await expect(whole).toHaveValue("123");
  const percent = page.locator("#q-youth_completion_rate");
  await percent.fill("");
  await percent.pressSequentially("4x5.5%");
  await expect(percent).toHaveValue("45.5");
  const hours = page.locator("#q-youth_program_hours");
  await hours.fill("$1,250.00");
  await expect(hours).toHaveValue("1250.00");
  await context.close();
});
