import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";

const STATEMENT =
  "These are application controls. FedRAMP authorization and a NIST assessment are performed on the production environment before go-live.";

for (const [who, label] of [
  ["priya", "an administrator"],
  ["daniel", "a finance analyst"],
] as const) {
  test.describe(`as ${label}`, () => {
    test.use({ storageState: authFile(who) });

    test(`[US-054][BR-026] the Security controls page maps each NIST control to its code and test`, async ({
      page,
    }) => {
      await page.goto("/finance/platform");
      await page.getByRole("link", { name: "See every security control and its test" }).click();
      await expect(page).toHaveURL(/\/finance\/platform\/controls$/);
      await expect(page.getByRole("heading", { name: "Security controls", level: 1 })).toBeVisible();
      await expect(page.getByText(STATEMENT)).toBeVisible();
      const table = page.getByRole("table");
      await expect(table.getByRole("columnheader")).toHaveText([
        "Control",
        "How LedgerLine meets it",
        "Where it lives",
        "Test that proves it",
        "Provided by",
      ]);
      const ac3 = table.getByRole("row").filter({ hasText: "AC-3" });
      await expect(ac3).toContainText("Access enforcement");
      await expect(ac3).toContainText("db/migrations/0005_access.sql");
      await expect(ac3).toContainText("tests/sql/access.test.ts");
      await expect(ac3).toContainText("Application");
      await expect(table.getByRole("row").filter({ hasText: "SC-28" })).toContainText(
        "Inherited from hosting provider",
      );
      await expect(table.getByRole("row").filter({ hasText: "CP-9" })).toContainText("Inherited from hosting provider");
      await expect(table.getByRole("row").filter({ hasText: "SC-8" })).toContainText("Shared");
      await expect(table.getByRole("row").filter({ hasText: "IR-4, IR-6" })).toContainText(
        "tests/sql/incidents.test.ts",
      );
    });
  });
}

test("[US-054][BR-026] the Security controls page is not available to an organization", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("maria"),
  });
  const page = await context.newPage();
  const response = await page.goto("/finance/platform/controls");
  expect(response?.status()).toBe(403);
  await expect(page.getByText(STATEMENT)).toHaveCount(0);
  await context.close();
});
