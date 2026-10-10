import { expect, test } from "@playwright/test";
import { authFile, PASSCODE, PEOPLE, signIn } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

test("[BR-011] a finance viewer signs in with the issued password and reaches the finance workspace", async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signIn(page, PEOPLE.grace);
  await expect(page).toHaveURL(/\/finance/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Finance (view only)").first()).toBeVisible();
  await context.close();
});

test("[BR-011] finance staff see the sidebar in labelled groups and submitters see their own links", async ({
  browser,
}) => {
  const finance = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("daniel"),
  });
  const staff = await finance.newPage();
  await staff.goto("/finance");
  const nav = staff.getByRole("navigation", { name: "Main" });
  for (const group of ["Review", "Programs", "Communications"])
    await expect(nav.getByText(group, { exact: true })).toBeVisible();
  for (const link of ["Dashboard", "Submissions", "Flagged items", "Initiatives", "Organizations", "Reminders"])
    await expect(nav.getByRole("link", { name: link })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Outbox" })).toBeHidden();
  await nav.getByText(/^More/).click();
  for (const link of ["Saved queries", "Trends", "Outbox", "Audit log", "Lineage", "Platform"])
    await expect(nav.getByRole("link", { name: link })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await finance.close();

  const org = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
  const portal = await org.newPage();
  await portal.goto("/portal");
  const links = portal.getByRole("navigation", { name: "Main" });
  for (const link of ["My reports", "Submission history", "Organization", "Messages"])
    await expect(links.getByRole("link", { name: link })).toBeVisible();
  await org.close();
});

test("[BR-011] after the passcode the start page shows the fiscal year calendar from the database and Start now opens sign in", async ({
  browser,
}) => {
  const [period] = await ownerQuery<{ label: string; due: string }>(
    "SELECT label, to_char(due_on, 'Mon FMDD, YYYY') AS due FROM reporting_period WHERE fiscal_year_id = 'FY27' ORDER BY due_on LIMIT 1",
  );
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/gate$/);
  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await ownerQuery("DELETE FROM auth_attempt WHERE id = (SELECT max(id) FROM auth_attempt WHERE key LIKE 'gate:%')");
  await expect(
    page.getByRole("heading", { name: "Report on your City Council initiative funding", level: 1 }),
  ).toBeVisible();
  const calendar = page.getByRole("list", { name: "FY27 reporting calendar" }).first();
  await expect(calendar).toContainText(`${period.label} due`);
  const keyDates = page.getByRole("complementary", { name: "Key dates" });
  await expect(keyDates).toContainText(`${period.label} report`);
  await expect(keyDates).toContainText(`Due ${period.due}`);
  await expect(page.getByText(/email copy/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Start now" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to LedgerLine", level: 1 })).toBeVisible();
  await context.close();
});

test("[US-016] starting a report is a POST from a button and opens the new draft", async ({ browser }) => {
  const [open] = await ownerQuery<{ assignment_id: string }>(
    `SELECT a.id AS assignment_id FROM assignment a JOIN initiative i ON i.id = a.initiative_id
     WHERE a.org_id = (SELECT org_id FROM app_user WHERE email = $1) AND i.fiscal_year_id = 'FY27'
       AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = 'FY27-YE')
     ORDER BY a.id LIMIT 1`,
    [PEOPLE.maria],
  );
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("maria"),
  });
  const page = await context.newPage();
  await page.goto(`/portal/reports/new?assignment=${open.assignment_id}&period=FY27-YE`);
  await expect(page.getByRole("heading", { name: "Start a report", level: 1 })).toBeVisible();
  const posted = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes("/portal/reports/new"),
  );
  await page.getByRole("button", { name: "Start report" }).click();
  await posted;
  await page.waitForURL(/\/portal\/reports\/[0-9a-f-]{36}$/);
  const created = await ownerQuery<{ status: string }>(
    "SELECT status FROM submission WHERE assignment_id = $1 AND period_id = 'FY27-YE'",
    [open.assignment_id],
  );
  expect(created).toEqual([{ status: "draft" }]);
  await context.close();
});

test("[BR-011] signing out revokes the session so a copied cookie stops working", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await signIn(page, PEOPLE.grace);
  const cookies = await context.cookies();
  await page.goto("/finance");
  await page
    .getByRole("group")
    .filter({ has: page.getByLabel(/Account menu for/) })
    .locator("summary")
    .click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  const replay = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  await replay.addCookies(cookies);
  const again = await replay.newPage();
  await again.goto("/finance");
  await expect(again).toHaveURL(/\/(login|gate)/);
  await replay.close();
  await context.close();
});

test("[BR-011] the ninth failed sign-in for one email within 15 minutes is refused with a wait notice", async ({
  browser,
}) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto("/gate");
  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  for (let attempt = 1; attempt <= 8; attempt++) {
    await page.goto("/login");
    await page.getByLabel("Work email").fill("nobody@motthavenyouth.example.org");
    await page.getByLabel("Password").fill(`wrong-${attempt}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That email and password do not match an account.")).toBeVisible();
  }
  await page.goto("/login");
  await page.getByLabel("Work email").fill("nobody@motthavenyouth.example.org");
  await page.getByLabel("Password").fill("wrong-9");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Too many attempts. Wait 15 minutes and try again.")).toBeVisible();
  await context.close();
});

test("[BR-011] switching between personas many times never locks anyone out", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  for (let round = 1; round <= 10; round++) {
    await signIn(page, PEOPLE.grace);
    await expect(page).toHaveURL(/\/finance/);
  }
  await context.close();
});

test("[BR-010] pages are served with an enforced content security policy and no violations", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("priya"),
  });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("console", (message) => {
    if (/content security policy|refused to/i.test(message.text())) problems.push(message.text());
  });
  const response = await page.goto("/finance");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("default-src");
  expect(headers["content-security-policy-report-only"]).toBeUndefined();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  await page.goto("/finance/submissions");
  await page.goto("/finance/organizations");
  expect(problems).toEqual([]);
  await context.close();
});
