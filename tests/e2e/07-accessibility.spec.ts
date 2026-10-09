import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";
import { settle } from "./support/settle";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function serious(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} at ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`);
}

async function check(page: Page, path: string, ready?: () => Promise<void>) {
  await page.goto(path);
  if (ready) await ready();
  else await settle(page);
  expect(await serious(page), path).toEqual([]);
}

test.describe("automated accessibility checks", () => {
  test("sign in pages", async ({ browser }) => {
    const gate = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page = await gate.newPage();
    await check(page, "/gate", async () => {
      await page.getByLabel("Passcode").waitFor();
    });
    const withGate = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("priya") });
    const cookies = (await withGate.cookies()).filter((c) => c.name !== "ll_session");
    await withGate.close();
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    await context.addCookies(cookies);
    const login = await context.newPage();
    await check(login, "/login", async () => {
      await login.getByLabel("Work email").waitFor();
    });
    await check(login, "/accessibility");
    await check(login, "/help");
    await gate.close();
    await context.close();
  });

  test("reporting portal", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
    const page = await context.newPage();
    await check(page, "/portal");
    await check(page, "/portal/history");
    await check(page, "/portal/messages");
    await check(page, "/portal/organization");
    const [draft] = await ownerQuery<{ id: string }>(
      `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN app_user u ON u.org_id = a.org_id
       WHERE u.email = 'maria.santos@motthavenyouth.example.org' AND s.status IN ('draft', 'returned') LIMIT 1`
    );
    if (draft) await check(page, `/portal/reports/${draft.id}`);
    const [done] = await ownerQuery<{ id: string }>(
      `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN app_user u ON u.org_id = a.org_id
       WHERE u.email = 'maria.santos@motthavenyouth.example.org' AND s.status IN ('submitted', 'under_review', 'accepted') LIMIT 1`
    );
    if (done) {
      await check(page, `/portal/reports/${done.id}`);
      await check(page, `/portal/reports/${done.id}/submitted`);
    }
    await context.close();
  });

  test("finance workspace", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("priya") });
    const page = await context.newPage();
    for (const path of ["/finance", "/finance/submissions", "/finance/flagged", "/finance/initiatives", "/finance/organizations", "/finance/outbox", "/finance/audit", "/finance/users", "/finance/reminders", "/finance/queries", "/finance/rollover", "/finance/platform", "/finance/initiatives/new"]) {
      await check(page, path);
    }
    const [sub] = await ownerQuery<{ id: string }>("SELECT id FROM submission WHERE status = 'accepted' LIMIT 1");
    await check(page, `/finance/submissions/${sub.id}`);
    const [org] = await ownerQuery<{ id: string }>("SELECT org_id AS id FROM assignment LIMIT 1");
    await check(page, `/finance/organizations/${org.id}`);
    const [initiative] = await ownerQuery<{ id: string }>("SELECT initiative_id AS id FROM assignment LIMIT 1");
    await check(page, `/finance/initiatives/${initiative.id}`);
    await context.close();
  });
});
