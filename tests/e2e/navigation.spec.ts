import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";

test.use({ storageState: authFile("daniel") });

test("[US-041] choosing a bucket on the submissions list updates the list within 3 seconds", async ({ page }) => {
  await page.goto("/finance/submissions");
  const buckets = page.getByRole("navigation", { name: "Filter by bucket" });
  await buckets.getByRole("link", { name: /^Missing/ }).click();
  await expect(page).toHaveURL(/bucket=missing/, { timeout: 3000 });
  await expect(buckets.getByRole("link", { name: /^Missing/ })).toHaveAttribute("aria-current", "true", {
    timeout: 3000,
  });
});
