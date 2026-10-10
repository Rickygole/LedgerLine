import type { Page } from "@playwright/test";

export async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForFunction(
    () => document.querySelector("main h1") !== null && document.querySelectorAll("main .skeleton").length === 0,
  );
  await page.waitForTimeout(350);
}
