import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";

test.use({ storageState: authFile("daniel") });

test("[US-039] clicking a district on the map opens its missing reports on the submissions list", async ({ page }) => {
  await page.goto("/finance?period=FY26-YE");
  const map = page.getByRole("group", { name: /Map of the 51 New York City Council districts/ });
  await expect(map.getByRole("link")).toHaveCount(51);
  const target = map.getByRole("link", { name: /, [1-9]\d* missing$/ }).first();
  const label = (await target.getAttribute("aria-label")) ?? "";
  const [, district, missing] = label.match(/^District (\d+),.* (\d+) missing$/) ?? [];
  expect(Number(missing)).toBeGreaterThan(0);

  await target.hover();
  await expect(page.getByText(`District ${district}`, { exact: true }).first()).toBeVisible();
  await target.click();

  await expect(page).toHaveURL(new RegExp(`/finance/submissions\\?.*district=${district}&by=sponsor&bucket=missing`));
  await expect(page.getByRole("heading", { level: 1, name: "Submissions" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Active filters" }).getByRole("link", { name: new RegExp(`District ${district}, funded by its Council Member`) })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Filter by bucket" }).getByRole("link", { name: /^Missing/ })).toHaveAttribute("aria-current", "true");
  await expect(page.locator("main tbody tr")).toHaveCount(Number(missing));
});

test("the map has a table view, borough chips and an organization location mode", async ({ page }) => {
  await page.goto("/finance?period=FY26-YE&table=1&sort=missing");
  const table = page.getByRole("table", { name: /Reports by Council district/ });
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(51);

  await page.getByRole("navigation", { name: "Borough" }).getByRole("link", { name: "Bronx" }).click();
  await expect(page).toHaveURL(/borough=Bronx/);
  const map = page.getByRole("group", { name: /Bronx highlighted/ });
  await expect(map.getByRole("link")).toHaveCount(9);
  await expect(map.getByRole("link", { name: /^District 8,/ })).toHaveCount(1);

  await page.getByLabel("Show by").selectOption("location");
  await expect(page).toHaveURL(/map=location/);
  await expect(page.getByText("Reports from organizations located in each district")).toBeVisible();
  await page.getByRole("group", { name: /Map of the 51/ }).getByRole("link", { name: /^District 8,/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/district=8&by=location/);
  await expect(page.getByRole("link", { name: /District 8, organization location/ })).toBeVisible();
});
