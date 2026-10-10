import { expect, test, type Browser } from "@playwright/test";
import * as XLSX from "xlsx";
import { authFile, certify, gotoStep, PEOPLE, submitOverdueDraft, SAVED_LABEL } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });
test.use({ storageState: authFile("daniel") });

let submissionId = "";
let referenceNo = "";
const NOTE = "Please explain the variance between participants targeted and served, and confirm the supplies total.";

async function asMaria<T>(browser: Browser, run: (page: import("@playwright/test").Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
  try {
    return await run(await context.newPage());
  } finally {
    await context.close();
  }
}

test.beforeAll(async ({ browser }) => {
  const [open] = await ownerQuery<{ id: string; status: string; reference_no: string }>(
    `SELECT s.id, s.status, s.reference_no FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE a.org_id = (SELECT org_id FROM app_user WHERE email = $1) AND s.status = 'draft' AND s.period_id = 'FY26-YE'`,
    [PEOPLE.maria]
  );
  if (open) {
    submissionId = await asMaria(browser, submitOverdueDraft);
    referenceNo = open.reference_no;
    return;
  }
  const [done] = await ownerQuery<{ id: string; reference_no: string }>(
    `SELECT s.id, s.reference_no FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE a.org_id = (SELECT org_id FROM app_user WHERE email = $1) AND s.status = 'submitted' ORDER BY s.submitted_at DESC LIMIT 1`,
    [PEOPLE.maria]
  );
  submissionId = done.id;
  referenceNo = done.reference_no;
});

test("[US-039][US-041] the dashboard loads and the submissions list filters down to one organization", async ({ page }) => {
  await page.goto("/finance");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/finance/submissions?q=13-4027118&period=FY26-YE");
  const link = page.getByRole("link", { name: referenceNo });
  await expect(link).toBeVisible();
  const rows = page.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  for (const text of await rows.allInnerTexts()) expect(text).toContain("13-4027118");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/finance/submissions/${submissionId}$`));
});

test("[US-043][US-042] an analyst flags a submission and it appears in the flagged items view", async ({ page }) => {
  await page.goto(`/finance/submissions/${submissionId}`);
  const note = "Supplies line needs a vendor breakdown";
  await page.getByText("Add a manual flag", { exact: true }).click();
  await page.getByLabel("Flag note").fill(note);
  await page.getByRole("button", { name: "Add manual flag" }).click();
  await expect(page.getByText(/flag.*added|added.*flag/i).first()).toBeVisible();
  await page.goto("/finance/flagged?flag=manual");
  await expect(page.getByText(note).first()).toBeVisible();
});

test("[US-044] an analyst requests an update with a note, the organization resubmits, and the analyst accepts", async ({ page, browser }) => {
  await page.goto(`/finance/submissions/${submissionId}`);
  await page.getByRole("button", { name: "Request update" }).click();
  await page.getByRole("button", { name: "Send to organization" }).click();
  await expect(page.getByText(/Write a note before sending/)).toBeVisible();
  await page.getByLabel("Note to the organization").fill(NOTE);
  await page.getByRole("button", { name: "Send to organization" }).click();
  await expect(page.getByText("Update request sent. The organization will see the note above its report.")).toBeVisible();

  const [row] = await ownerQuery<{ status: string }>("SELECT status FROM submission WHERE id = $1", [submissionId]);
  expect(row.status).toBe("returned");

  await asMaria(browser, async (maria) => {
    await maria.goto(`/portal/reports/${submissionId}`);
    await expect(maria.getByText(NOTE)).toBeVisible();
    await gotoStep(maria, "Organization and contact");
    await maria.locator("#q-contact_title").fill("Executive Director");
    await expect(maria.getByText(SAVED_LABEL)).toBeVisible({ timeout: 20_000 });
    await certify(maria);
    await maria.getByRole("button", { name: "Submit report" }).click();
    await maria.waitForURL(/\/submitted$/);
  });

  await page.goto(`/finance/submissions/${submissionId}`);
  await page.getByRole("button", { name: "Accept report" }).click();
  await expect(page.getByText("This report is accepted.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept report" })).toHaveCount(0);
  const [after] = await ownerQuery<{ status: string; revision: number }>("SELECT status, revision FROM submission WHERE id = $1", [submissionId]);
  expect(after).toEqual({ status: "accepted", revision: 2 });
});

test("[US-045][US-057] a correction after acceptance needs a reason and leaves an audit record", async ({ page }) => {
  await page.goto(`/finance/submissions/${submissionId}`);
  await page.getByText("Correct an answer", { exact: true }).click();
  await page.getByLabel("Question").selectOption({ label: "Report contact title" });
  await page.getByLabel("New value").fill("Chief Program Officer");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Enter a reason. Every correction is recorded with its reason.")).toBeVisible();
  await page.getByLabel("Reason").fill("Title confirmed by phone with the organization");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText("Correction saved as a new revision.")).toBeVisible();
  const rows = await ownerQuery<{ action: string; note: string }>(
    "SELECT action, note FROM audit_event WHERE entity = 'submission' AND entity_id = $1 AND action = 'correction'",
    [submissionId]
  );
  expect(rows).toEqual([{ action: "correction", note: "Title confirmed by phone with the organization" }]);
  await page.goto("/finance/audit");
  await expect(page.locator("main table").getByText(/corrected/i).first()).toBeVisible();
});

test("[US-046][US-047] submitted data downloads as Excel and as CSV for the filtered list, for finance staff only", async ({ page, browser }) => {
  const csv = await page.request.get("/api/export?q=13-4027118&period=FY26-YE&format=csv");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toContain("attachment");
  const lines = (await csv.text()).trim().split("\n");
  expect(lines[0]).toContain("reference_no");
  expect(lines.length).toBeGreaterThan(1);
  for (const line of lines.slice(1)) expect(line).toContain("13-4027118");

  const xlsx = await page.request.get("/api/export?q=13-4027118&period=FY26-YE");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  const book = XLSX.read(await xlsx.body(), { type: "buffer" });
  expect(book.SheetNames).toEqual(["Submissions", "Budget lines", "README"]);
  expect(XLSX.utils.sheet_to_json(book.Sheets["Submissions"]).length).toBe(lines.length - 1);

  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
  const denied = await context.request.get("/api/export?period=FY26-YE");
  expect(denied.status()).toBe(403);
  await context.close();
});

test("[US-049][US-051] the dashboard draws its charts from the current reports", async ({ page }) => {
  await page.goto("/finance");
  const charts = page.locator("svg.recharts-surface");
  await expect(charts.first()).toBeVisible();
  expect(await charts.count()).toBeGreaterThanOrEqual(2);
  expect(await page.locator(".recharts-bar-rectangle, .recharts-sector").count()).toBeGreaterThan(0);
});
