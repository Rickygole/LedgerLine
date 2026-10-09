import { expect, test } from "@playwright/test";
import { authFile, fillRequiredAnswers, openOverdueDraft, PEOPLE, setBudget, signIn } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("maria") });

let submittedId = "";

test("[BR-011][US-013] a submitter signs in through the passcode gate with a personal account", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/gate/);
  await signIn(page, PEOPLE.maria);
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByText("Welcome, Maria")).toBeVisible();
  await context.close();
});

test("[BR-010][US-014] a submitter cannot open another organization's report by its address", async ({ page }) => {
  const [foreign] = await ownerQuery<{ id: string }>(
    `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE a.org_id <> (SELECT org_id FROM app_user WHERE email = $1) LIMIT 1`,
    [PEOPLE.maria]
  );
  const response = await page.goto(`/portal/reports/${foreign.id}`);
  expect(response?.status()).toBe(404);
  const submitted = await page.goto(`/portal/reports/${foreign.id}/submitted`);
  expect(submitted?.status()).toBe(404);
});

test("[US-016] a submitter starts the report the organization owes from the portal", async ({ page }) => {
  await page.goto("/portal");
  await expect(page.getByRole("heading", { name: "My reports", level: 1 })).toBeVisible();
  const id = await openOverdueDraft(page);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByText(/^LL-[A-Z0-9]+-\d+$/).first()).toBeVisible();
});

test("[BR-021][US-031] submitting with required answers missing lists each one", async ({ page }) => {
  await openOverdueDraft(page);
  await page.getByRole("button", { name: "Submit report" }).click();
  const summary = page.getByRole("alert").filter({ hasText: /need|problem|fix/i }).first();
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/participants targeted this period/i);
  await expect(summary).toContainText(/budget line/i);
  await expect(page).toHaveURL(/\/portal\/reports\/[0-9a-f-]{36}$/);
});

test("[US-017][US-018] answers save automatically and are still there after reload", async ({ page }) => {
  await openOverdueDraft(page);
  await fillRequiredAnswers(page);
  await expect(page.getByText(/^Saved \d/)).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.locator("#q-participants_target")).toHaveValue("120");
  await expect(page.locator("#q-sites_count")).toHaveValue("3");
});

test("[BR-022][US-028][US-032][US-035] an unbalanced budget is refused with the amount, then submits once fixed", async ({ page }) => {
  await openOverdueDraft(page);
  await fillRequiredAnswers(page);
  await setBudget(page, [
    { category: "PS", description: "Mentor stipends", amount: "60000" },
    { category: "OTPS", description: "Program supplies", amount: "20000" },
  ]);
  await expect(page.getByText("$5,000.00 under award")).toBeVisible();
  await page.getByRole("button", { name: "Submit report" }).click();
  const refusal = page.getByRole("alert").filter({ hasText: /must equal award/ }).first();
  await expect(refusal).toContainText("Total $80,000.00 must equal award $85,000.00 (under by $5,000.00).");
  await expect(page).toHaveURL(/\/portal\/reports\/[0-9a-f-]{36}$/);
  await page.getByLabel("Line 2 Amount").fill("25000");
  await page.getByLabel("Line 2 Amount").blur();
  await expect(page.getByText(/Balanced|equals the award/).first()).toBeVisible();
  await expect(page.getByText(/^Saved \d/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Submit report" }).click();
  await page.waitForURL(/\/submitted$/);
  await expect(page.getByRole("heading", { name: "Report received" })).toBeVisible();
  submittedId = page.url().split("/").slice(-2)[0];
});

test("[US-019][US-020][BR-014] a submission is locked and an emailed copy with the content is queued", async ({ page }) => {
  expect(submittedId).toMatch(/^[0-9a-f-]{36}$/);
  const [sub] = await ownerQuery<{ status: string; revision: number }>("SELECT status, revision FROM submission WHERE id = $1", [submittedId]);
  expect(sub).toEqual({ status: "submitted", revision: 1 });
  const [mail] = await ownerQuery<{ to_email: string; body_text: string; template: string }>(
    "SELECT to_email, body_text, template FROM outbox WHERE submission_id = $1",
    [submittedId]
  );
  expect(mail.to_email).toBe(PEOPLE.maria);
  expect(mail.template).toBe("submission_confirmation");
  expect(mail.body_text).toContain("Mentor stipends");
  expect(mail.body_text).toContain("Program supplies");
  await page.goto(`/portal/reports/${submittedId}`);
  await expect(page.getByRole("button", { name: "Submit report" })).toHaveCount(0);
  await page.goto("/portal/messages");
  await expect(page.getByText(/Report received/).first()).toBeVisible();
});
