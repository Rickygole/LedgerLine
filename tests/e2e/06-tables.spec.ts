import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";
import { settle } from "./support/settle";

test.use({ storageState: authFile("priya"), viewport: { width: 1440, height: 900 } });

const LIST_PAGES = [
  "/finance",
  "/finance/submissions",
  "/finance/flagged",
  "/finance/initiatives",
  "/finance/organizations",
  "/finance/outbox",
  "/finance/audit",
  "/finance/users",
  "/finance/reminders",
  "/finance/queries",
  "/finance/rollover/lineage",
  "/finance/platform",
];

async function overflowing(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("main table")]
      .map((table) => {
        const box = table.parentElement as HTMLElement;
        const caption = table.closest("section, [id]")?.querySelector("h2, h3")?.textContent ?? "";
        return { caption: caption.trim(), scrollWidth: box.scrollWidth, clientWidth: box.clientWidth };
      })
      .filter((t) => t.clientWidth > 0 && t.scrollWidth > t.clientWidth)
  );
}

test("no finance list table scrolls sideways at 1440 with the sidebar open", async ({ page }) => {
  for (const path of LIST_PAGES) {
    await page.goto(path);
    await settle(page);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    expect(await overflowing(page), path).toEqual([]);
  }
});

test("the reminder preview table fits on a date that has recipients", async ({ page }) => {
  await page.goto("/finance/reminders");
  await settle(page);
  const links = page.locator("main tbody a[href*='date=']");
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    await page.goto("/finance/reminders");
    await settle(page);
    await page.locator("main tbody a[href*='date=']").nth(i).click();
    await page.waitForURL(/date=/);
    await settle(page);
    expect(await overflowing(page), page.url()).toEqual([]);
  }
});

test("no finance detail table scrolls sideways at 1440 with the sidebar open", async ({ page }) => {
  const [org] = await ownerQuery<{ id: string }>("SELECT org_id AS id FROM assignment GROUP BY org_id ORDER BY count(*) DESC LIMIT 1");
  const [initiative] = await ownerQuery<{ id: string }>("SELECT initiative_id AS id FROM assignment GROUP BY initiative_id ORDER BY count(*) DESC LIMIT 1");
  const [message] = await ownerQuery<{ id: string }>("SELECT id FROM outbox ORDER BY created_at DESC LIMIT 1");
  const paths = [`/finance/organizations/${org.id}`, `/finance/organizations/${org.id}?tab=awards`, `/finance/organizations/${org.id}?tab=reports`, `/finance/initiatives/${initiative.id}`];
  if (message) paths.push(`/finance/outbox/${message.id}`);
  for (const path of paths) {
    await page.goto(path);
    await settle(page);
    expect(await overflowing(page), path).toEqual([]);
  }
});

test("the submissions table keeps every flag visible at 1280", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/finance/submissions?flag=any");
  await settle(page);
  expect(await overflowing(page)).toEqual([]);
});
