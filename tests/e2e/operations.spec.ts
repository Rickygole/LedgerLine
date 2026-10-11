import { readdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ownerQuery } from "./support/db";
import { authFile } from "./support/app";

async function as(browser: import("@playwright/test").Browser, who: "maria" | "daniel" | "priya" | "grace") {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile(who) });
  return { context, page: await context.newPage() };
}

async function totalOf(page: Page): Promise<number> {
  const cells = await page.locator("figure").first().locator("tbody tr td:last-child").allTextContents();
  return cells.reduce((sum, text) => sum + Number(text), 0);
}

test("[US-062] the health endpoint answers without the passcode and reveals nothing sensitive", async ({
  playwright,
}) => {
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const response = await api.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.database.ok).toBe(true);
  const files = readdirSync(path.resolve(__dirname, "../../db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  expect(body.migrations.latest).toBe(files[files.length - 1]);
  expect(body.requestId).toBe(response.headers()["x-request-id"]);
  const text = JSON.stringify(body);
  for (const secret of [
    process.env.APP_DATABASE_URL,
    process.env.DB_OWNER_URL,
    process.env.AUTH_SECRET,
    process.env.GATE_PASSCODE,
    "postgres://",
  ])
    if (secret) expect(text).not.toContain(secret);
  const other = await api.get("/api/export?period=FY26-YE");
  expect(other.status()).toBe(401);
  const second = await api.get("/api/health");
  expect(second.headers()["x-request-id"]).not.toBe(response.headers()["x-request-id"]);
  await api.dispose();
});

test("[US-062] an error page shows the request ID that the response carried", async ({ browser }) => {
  const { context, page } = await as(browser, "priya");
  const response = await page.goto("/finance/no-such-page");
  expect(response?.status()).toBe(404);
  const header = response!.headers()["x-request-id"];
  expect(header).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.getByTestId("request-id")).toHaveText(header);
  await context.close();
});

test("[US-062] the platform page shows the health status to administrators only", async ({ browser }) => {
  const admin = await as(browser, "priya");
  await admin.page.goto("/finance/platform");
  await expect(admin.page.getByRole("heading", { name: "Platform status" })).toBeVisible();
  await expect(admin.page.getByText("Healthy")).toBeVisible();
  await expect(admin.page.getByText("Connected")).toBeVisible();
  expect(await admin.page.locator("main").innerText()).not.toMatch(/\b(US|BR)-\d{3}\b/);
  await admin.context.close();
  const analyst = await as(browser, "daniel");
  await analyst.page.goto("/finance/platform");
  await expect(analyst.page.getByRole("heading", { name: "Platform status" })).toHaveCount(0);
  expect(await analyst.page.locator("main").innerText()).not.toMatch(/\b(US|BR)-\d{3}\b/);
  await analyst.context.close();
});

test("[US-050] the trend and comparison charts draw from the reports and change with the filters", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "daniel");
  await page.goto("/finance/trends");
  await expect(page.getByRole("heading", { name: "Trends and comparisons", level: 1 })).toBeVisible();
  await expect(page.locator("svg.recharts-surface")).toHaveCount(2);
  expect(await page.locator(".recharts-bar-rectangle").count()).toBeGreaterThan(0);
  const all = await totalOf(page);
  expect(all).toBe(372);

  await page.getByLabel("Category", { exact: true }).selectOption("Youth Services");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/category=Youth\+Services/);
  await expect(page.locator("svg.recharts-surface")).toHaveCount(2);
  const youth = await totalOf(page);
  expect(youth).toBeGreaterThan(0);
  expect(youth).toBeLessThan(all);
  await expect(page.getByLabel("Category", { exact: true })).toHaveValue("Youth Services");

  await page.getByLabel("Borough", { exact: true }).selectOption("Bronx");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/borough=Bronx/);
  expect(await totalOf(page)).toBeLessThan(youth);
  await context.close();
});

test("[US-061][US-063][BR-029] users send help requests, see only their own, and an administrator answers from the queue", async ({
  browser,
}) => {
  const subject = `Cannot find the budget grid ${Date.now()}`;
  const maria = await as(browser, "maria");
  await maria.page.goto("/portal");
  await maria.page.getByRole("contentinfo").getByRole("link", { name: "Help and contact", exact: true }).click();
  await expect(maria.page).toHaveURL(/\/help$/);
  await maria.page.getByRole("link", { name: "Send a help request" }).click();
  await expect(maria.page).toHaveURL(/\/portal\/help$/);
  await maria.page.getByLabel("What do you need help with").selectOption("report");
  await maria.page.getByLabel("Subject").fill(subject);
  await maria.page.getByLabel("Details").fill("The budget grid does not show on my report.");
  await maria.page.getByRole("button", { name: "Send request" }).click();
  await expect(maria.page.getByRole("status")).toContainText(/reference is SR-\d{5}/);
  await expect(maria.page.getByRole("link", { name: subject })).toBeVisible();

  const analyst = await as(browser, "daniel");
  await analyst.page.goto("/finance/help");
  await expect(analyst.page.getByRole("link", { name: subject })).toHaveCount(0);
  expect((await analyst.page.goto("/finance/support"))?.status()).toBe(403);
  await expect(analyst.page.getByRole("link", { name: "Administration" })).toHaveCount(0);
  await analyst.context.close();

  const admin = await as(browser, "priya");
  await admin.page.goto("/finance/support");
  await expect(admin.page.getByText(/\d+ open, \d+ overdue/)).toBeVisible();
  await admin.page.getByRole("link", { name: subject }).click();
  await admin.page
    .getByLabel(/Reply to Maria Santos/)
    .fill("The grid appears under Budget once the first two sections are saved.");
  await admin.page.getByRole("button", { name: "Send reply" }).click();
  await expect(admin.page.getByRole("status")).toContainText("Your message was sent.");
  await admin.page.reload();
  await expect(admin.page.getByText(/after \d+ minutes?|after 0 minutes/).first()).toBeVisible();
  const [row] = await ownerQuery<{ state: string }>("SELECT state FROM support_queue WHERE subject = $1", [subject]);
  expect(row.state).toBe("responded");
  await admin.context.close();

  await maria.page.goto("/portal/help");
  await maria.page.getByRole("link", { name: subject }).click();
  await expect(maria.page).toHaveURL(/request=/);
  await expect(maria.page.getByText("The grid appears under Budget")).toBeVisible();
  await maria.context.close();
});

test("an administrator reaches every operations area from one Administration entry", async ({ browser }) => {
  const { context, page } = await as(browser, "priya");
  await page.goto("/finance");
  const main = page.getByRole("navigation", { name: "Main" }).first();
  if (!(await main.getByRole("link", { name: "Administration" }).isVisible())) await main.getByText(/^More/).click();
  await main.getByRole("link", { name: "Administration" }).click();
  await expect(page).toHaveURL(/\/finance\/admin$/);
  for (const name of [
    "Support queue",
    "Security incidents",
    "Annual structure review",
    "Go-live readiness",
    "Export all data",
    "Platform and status",
  ]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await expect(page.getByText(/\bUS-\d{3}\b/)).toHaveCount(0);
  await context.close();
});

test("[US-058][BR-025] an administrator records a breach, the Council's contacts are queued a notice, and remediation is tracked", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "priya");
  await page.goto("/finance/incidents");
  const marker = `shared folder ${Date.now()}`;
  const detected = new Date(Date.now() - 3 * 3_600_000);
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
    dateStyle: "short",
    timeStyle: "short",
  })
    .format(detected)
    .replace(" ", "T");
  await page.getByLabel("Detected at (Eastern time)").fill(local);
  await page.getByLabel("Severity").selectOption("high");
  await page.getByLabel("What happened").fill(`A support export was left in a ${marker} for about an hour.`);
  await page.getByLabel("Data affected").fill("Organization names and contact emails for 40 organizations.");
  await page.getByRole("button", { name: "Record and notify" }).click();
  await expect(page.getByRole("status")).toContainText(/INC-\d{4} recorded\. 3 designated contacts were notified/);
  const mail = await ownerQuery<{ to_email: string }>(
    "SELECT to_email FROM outbox WHERE template = 'security_incident' AND body_text LIKE $1 ORDER BY to_email",
    [`%${marker}%`],
  );
  expect(mail).toHaveLength(3);

  await page.reload();
  const row = page.locator("tbody tr").filter({ hasText: "High" }).first();
  await expect(row.getByText("Notice on time")).toBeVisible();
  await row.getByRole("link", { name: /INC-\d{4}/ }).click();
  await expect(page.getByText(/Report due in/).first()).toBeVisible();
  await page.getByLabel("Root cause").fill("A sharing setting on the folder was changed by mistake.");
  await page.getByLabel("Actions taken").fill("Removed the file, reset the setting and checked the access log.");
  await page
    .getByLabel("Plan to reduce the risk of a repeat")
    .fill("Lock the setting and review folder sharing monthly.");
  await page.getByRole("button", { name: "Save report" }).click();
  await expect(page.getByRole("status")).toContainText("Remediation report saved");
  await page.reload();
  await expect(page.getByText("Remediation in progress").first()).toBeVisible();
  await page
    .getByLabel("Completed on")
    .fill(new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York" }).format(new Date()));
  await page.getByRole("button", { name: "Save updated report" }).click();
  await expect(page.getByRole("status")).toContainText("marked complete");
  await page.reload();
  await expect(page.getByText("Remediated").first()).toBeVisible();
  await expect(page.getByText("Remediation completed")).toBeVisible();

  const daniel = await as(browser, "daniel");
  expect((await daniel.page.goto("/finance/incidents"))?.status()).toBe(403);
  await daniel.page.goto("/finance/outbox");
  await expect(daniel.page.getByText("Security incident INC")).toHaveCount(0);
  await daniel.context.close();
  await context.close();
});

test("[US-064][BR-028] the annual review is kept per fiscal year and appears in the rollover", async ({ browser }) => {
  const { context, page } = await as(browser, "priya");
  await page.goto("/finance/reviews");
  await expect(page.getByRole("link", { name: "FY26" })).toBeVisible();
  await expect(page.getByText(/Signed off/).first()).toBeVisible();
  await page.getByRole("link", { name: "FY27" }).click();
  await expect(page.getByRole("heading", { name: "FY27 structure review" })).toBeVisible();
  await expect(page.getByText("No decisions are recorded.")).toHaveCount(0);
  await page.getByRole("button", { name: "Tick Users and permissions" }).click();
  await expect(page.getByRole("button", { name: "Untick Users and permissions" })).toBeVisible();
  await page.getByRole("button", { name: "Sign off review" }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Tick every checklist item");
  await page.goto("/finance/rollover?from=FY26");
  await expect(page.getByRole("heading", { name: "FY26 structure review" })).toBeVisible();
  await expect(page.getByText(/Signed off/).first()).toBeVisible();
  await expect(page.getByText(/Retire the seven initiatives/)).toBeVisible();
  await context.close();
});

test("[US-065][US-066] readiness shows the share of Finance users trained and the test pass rate", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "priya");
  await page.goto("/finance/readiness");
  await expect(page.getByText(/Finance users trained: \d+%/)).toBeVisible();
  await expect(page.getByText(/Test scenarios passing: None yet/)).toBeVisible();
  const before = Number((await page.getByText(/Finance users trained: \d+%/).textContent())!.match(/(\d+)%/)![1]);
  await page.getByLabel("Scenario").fill("Analyst prints the dashboard");
  await page.locator("#tester").fill("Grace Chen");
  await page.getByLabel("Tester role or team").fill("Policy Advisor, Council Finance");
  await page.getByLabel("Result").selectOption("passed");
  await page.getByRole("button", { name: "Record session" }).click();
  await expect(page.getByRole("status")).toContainText("Session recorded as passed");
  await page.reload();
  await expect(page.getByText(/Test scenarios passing: 100%/)).toBeVisible();

  expect(before).toBe(0);
  await context.close();
});

test("[US-055][BR-020] only an administrator can download the data package, which holds every table and a README", async ({
  browser,
}) => {
  const admin = await as(browser, "priya");
  await admin.page.goto("/finance/data");
  await expect(admin.page.getByRole("link", { name: "Download data package" })).toBeVisible();
  const response = await admin.page.request.get("/api/export/all");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/zip");
  expect(response.headers()["content-disposition"]).toMatch(/ledgerline-data-package-\d{4}-\d{2}-\d{2}\.zip/);
  const zip = await response.body();
  expect(zip.subarray(0, 2).toString()).toBe("PK");
  for (const name of [
    "README.txt",
    "manifest.csv",
    "data/submission.csv",
    "data/organization.csv",
    "data/audit_event.csv",
    "data/support_request.csv",
    "data/security_incident.csv",
  ])
    expect(zip.includes(Buffer.from(name))).toBe(true);
  expect(zip.includes(Buffer.from("data/password_token.csv"))).toBe(false);
  const [audit] = await ownerQuery<{ n: number }>(
    "SELECT count(*)::int AS n FROM audit_event WHERE action = 'export_all'",
  );
  expect(audit.n).toBeGreaterThan(0);
  await admin.context.close();

  for (const who of ["daniel", "maria"] as const) {
    const other = await as(browser, who);
    expect((await other.page.request.get("/api/export/all")).status()).toBe(403);
    await other.context.close();
  }
});
