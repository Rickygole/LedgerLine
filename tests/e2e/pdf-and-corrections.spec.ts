import { expect, test } from "@playwright/test";
import { authFile, PEOPLE } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

let reportId = "";
let referenceNo = "";
let mariaReportId = "";
let mariaReference = "";

test.beforeAll(async () => {
  const [target] = await ownerQuery<{ id: string; reference_no: string }>(
    `SELECT s.id, s.reference_no FROM submission s
     WHERE s.status = 'submitted' AND s.period_id = 'FY26-YE'
       AND s.assignment_id NOT IN (SELECT a.id FROM assignment a WHERE a.org_id = (SELECT org_id FROM app_user WHERE email = $1))
       AND EXISTS (SELECT 1 FROM answer x WHERE x.submission_id = s.id AND x.question_key = 'youth_breakdown')
       AND (SELECT count(*) FROM budget_line b WHERE b.submission_id = s.id) >= 2
     ORDER BY s.reference_no LIMIT 1`,
    [PEOPLE.maria],
  );
  reportId = target.id;
  referenceNo = target.reference_no;
  const [mine] = await ownerQuery<{ id: string; reference_no: string }>(
    `SELECT s.id, s.reference_no FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE a.org_id = (SELECT org_id FROM app_user WHERE email = $1) AND s.status = 'accepted' ORDER BY s.reference_no LIMIT 1`,
    [PEOPLE.maria],
  );
  mariaReportId = mine.id;
  mariaReference = mine.reference_no;
});

test.describe("finance", () => {
  test.use({ storageState: authFile("daniel") });

  test("[US-021] Finance downloads the submitted report as a PDF", async ({ page }) => {
    await page.goto(`/finance/submissions/${reportId}`);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`^${referenceNo}-revision-\\d+\\.pdf$`));
    const response = await page.request.get(`/finance/submissions/${reportId}/pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect((await response.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("[US-021] the portal PDF route is closed to Finance staff", async ({ page }) => {
    const response = await page.request.get(`/portal/reports/${reportId}/pdf`);
    expect(response.status()).toBe(403);
  });

  test("[US-045] a correction can change a budget line, add a line and edit a table, each with a reason", async ({
    page,
  }) => {
    const before = await ownerQuery<{ amount: string; description: string }>(
      "SELECT amount::text, description FROM budget_line WHERE submission_id = $1 ORDER BY position",
      [reportId],
    );
    await page.goto(`/finance/submissions/${reportId}`);
    await page.getByText("Correct an answer", { exact: true }).click();
    await page.getByLabel("Question").selectOption({ label: "Budget lines" });

    const first = Number(before[0].amount);
    await page.locator("#corr-line-0-amount").fill(String(first + 100));
    await page.getByLabel("Reason").fill("Align with the signed budget");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText(/This correction would leave the budget with a problem/)).toBeVisible();

    await page.locator("#corr-line-0-amount").fill(String(first - 100));
    await page.getByRole("button", { name: "Add a line" }).click();
    const last = before.length;
    await page.locator(`#corr-line-${last}-description`).fill("Participant transit passes");
    await page.locator(`#corr-line-${last}-amount`).fill("100");
    await page.locator("#corr-line-1-description").fill("Revised second line");
    await page.getByLabel("Reason").fill("");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText("Enter a reason. Every correction is recorded with its reason.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a reason. Every correction is recorded" })).toBeVisible();
    await page.getByLabel("Reason").fill("Moved 100 dollars to a new transit line after the site visit");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText("Correction saved as a new revision.")).toBeVisible();

    const lines = await ownerQuery<{ amount: string; description: string; category: string }>(
      "SELECT amount::text, description, category FROM budget_line WHERE submission_id = $1 ORDER BY position",
      [reportId],
    );
    expect(lines).toHaveLength(before.length + 1);
    expect(lines[0].amount).toBe((first - 100).toFixed(2));
    expect(lines[1].description).toBe("Revised second line");
    expect(lines[last]).toMatchObject({ description: "Participant transit passes", amount: "100.00" });
    const [audit] = await ownerQuery<{ note: string; before: { value: unknown[] }; after: { value: unknown[] } }>(
      `SELECT note, before, after FROM audit_event WHERE entity = 'submission' AND entity_id = $1 AND action = 'correction'
       ORDER BY id DESC LIMIT 1`,
      [reportId],
    );
    expect(audit.note).toBe("Moved 100 dollars to a new transit line after the site visit");
    expect(audit.before.value).toHaveLength(before.length);
    expect(audit.after.value).toHaveLength(before.length + 1);
    const [revision] = await ownerQuery<{ kind: string; reason: string }>(
      "SELECT kind, reason FROM submission_revision WHERE submission_id = $1 ORDER BY revision DESC LIMIT 1",
      [reportId],
    );
    expect(revision.kind).toBe("correction");

    await page.reload();
    await page.getByText("Correct an answer", { exact: true }).click();
    await page.getByLabel("Question").selectOption({ label: "Participants under 18 by age group" });
    await page.locator("#corr-row-0-count").fill("7");
    await page.getByRole("button", { name: "Add a row" }).click();
    await page.locator("#corr-row-3-age_group").fill("18 and over");
    await page.locator("#corr-row-3-count").fill("2");
    await page.getByLabel("Reason").fill("Counts confirmed against the sign-in sheets");
    await page.getByRole("button", { name: "Save correction" }).click();
    await expect(page.getByText("Correction saved as a new revision.")).toBeVisible();
    const [table] = await ownerQuery<{ value: Array<Record<string, string>> }>(
      "SELECT value FROM answer WHERE submission_id = $1 AND question_key = 'youth_breakdown'",
      [reportId],
    );
    expect(table.value).toHaveLength(4);
    expect(table.value[0].count).toBe("7");
    expect(table.value[3]).toEqual({ age_group: "18 and over", count: "2" });

    await page.goto(`/finance/submissions/${reportId}?tab=audit`);
    await expect(page.getByText(/Added line \d+: OTPS Participant transit passes, \$100\.00/)).toBeVisible();
  });
});

test.describe("organization", () => {
  test.use({ storageState: authFile("maria") });

  test("[US-021] the organization downloads its own submitted report as a PDF and cannot fetch another organization's", async ({
    page,
  }) => {
    await page.goto(`/portal/reports/${mariaReportId}`);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp(`^${mariaReference}-revision-\\d+\\.pdf$`));
    const own = await page.request.get(`/portal/reports/${mariaReportId}/pdf`);
    expect(own.status()).toBe(200);
    expect((await own.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const other = await page.request.get(`/portal/reports/${reportId}/pdf`);
    expect(other.status()).toBe(404);
    const finance = await page.request.get(`/finance/submissions/${mariaReportId}/pdf`);
    expect(finance.status()).toBe(403);
  });
});

test("[US-021] the PDF routes need a signed-in user", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const response = await context.request.get(`/portal/reports/${mariaReportId}/pdf`, { maxRedirects: 0 });
  expect([302, 307, 308, 401]).toContain(response.status());
  await context.close();
});
