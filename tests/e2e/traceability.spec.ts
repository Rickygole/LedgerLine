import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";

test.describe("requirements traceability page", () => {
  test("is not available to finance analysts or organizations", async ({ browser }) => {
    for (const who of ["daniel", "maria"] as const) {
      const context = await browser.newContext({
        baseURL: test.info().project.use.baseURL,
        storageState: authFile(who),
      });
      const page = await context.newPage();
      const response = await page.goto("/trust");
      expect(response?.status()).toBe(403);
      await context.close();
    }
  });

  test("sends a visitor who is not signed in to the sign-in page", async ({ browser }) => {
    const gate = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: authFile("priya"),
    });
    const cookies = (await gate.cookies()).filter((c) => c.name !== "ll_session");
    await gate.close();
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    await context.addCookies(cookies);
    const page = await context.newPage();
    await page.goto("/trust");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });

  test.describe("as an administrator", () => {
    test.use({ storageState: authFile("priya") });

    test("shows the legend, the build and a matrix of every requirement", async ({ page }) => {
      await page.goto("/finance/platform");
      await page.getByRole("link", { name: "Requirements traceability" }).click();
      await expect(page).toHaveURL(/\/trust$/);
      await expect(page.getByRole("heading", { name: "Requirements traceability", level: 1 })).toBeVisible();
      for (const label of ["Verified by test", "Supporting tool built", "Demonstrated", "Planned"])
        await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Build", { exact: true })).toBeVisible();
      await expect(page.getByText("Generated", { exact: true })).toBeVisible();
      await expect(
        page.getByText(/\d+ verified by test, \d+ supporting tools built, \d+ delivery commitments/),
      ).toBeVisible();
      await expect(page.locator("tbody tr")).toHaveCount(95);
    });

    test("is not offered to an analyst on the platform page", async ({ browser }) => {
      const context = await browser.newContext({
        baseURL: test.info().project.use.baseURL,
        storageState: authFile("daniel"),
      });
      const page = await context.newPage();
      await page.goto("/finance/platform");
      await expect(page.getByRole("heading", { name: "Platform and delivery", level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Requirements traceability" })).toHaveCount(0);
      await context.close();
    });
  });
});
