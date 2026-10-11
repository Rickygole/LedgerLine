import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";

test.use({ storageState: authFile("priya") });

test("[US-060][BR-017] an administrator sets a Finance analyst's access scope and sees it listed", async ({ page }) => {
  await page.goto("/finance/users?q=Marisol");
  const row = page.getByRole("row", { name: /Marisol Vandenberg/ });
  await expect(row.getByTestId("scope-label")).toHaveText("DYCD");

  await row.getByRole("button", { name: /Manage/ }).click();
  const dialog = page.getByRole("dialog", { name: /Manage Marisol Vandenberg/ });
  await dialog.getByRole("checkbox", { name: "DFTA" }).check();
  await dialog.getByLabel(/Add an initiative/).fill("Senior");
  await dialog.getByRole("list", { name: "Matching initiatives" }).getByRole("button").first().click();
  await expect(dialog.getByRole("list", { name: "Chosen initiatives" }).getByRole("listitem")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Save access scope" }).click();
  await expect(dialog.getByRole("status")).toContainText(
    "Access scope for Marisol Vandenberg is now DFTA, DYCD and 1 initiative.",
  );

  await page.reload();
  await expect(page.getByRole("row", { name: /Marisol Vandenberg/ }).getByTestId("scope-label")).toHaveText(
    "DFTA, DYCD and 1 initiative",
  );
  const [event] = await ownerQuery<{ n: number }>(
    "SELECT count(*)::int AS n FROM audit_event WHERE entity = 'app_user' AND action = 'scope_change'",
  );
  expect(event.n).toBeGreaterThan(0);

  await page
    .getByRole("row", { name: /Marisol Vandenberg/ })
    .getByRole("button", { name: /Manage/ })
    .click();
  const again = page.getByRole("dialog", { name: /Manage Marisol Vandenberg/ });
  await again.getByRole("checkbox", { name: "DFTA" }).uncheck();
  await again.getByRole("button", { name: /^Remove / }).click();
  await again.getByRole("button", { name: "Save access scope" }).click();
  await expect(again.getByRole("status")).toContainText("is now DYCD.");
  await page.reload();
  await expect(page.getByRole("row", { name: /Marisol Vandenberg/ }).getByTestId("scope-label")).toHaveText("DYCD");
});

test("[US-060][BR-017] a scoped Finance user sees only their scope and a note saying so", async ({ browser }) => {
  const [{ id }] = await ownerQuery<{ id: string }>(
    "SELECT id FROM app_user WHERE email = 'grace.chen@finance.example.gov'",
  );
  const reference = async (inside: boolean) =>
    (
      await ownerQuery<{ reference_no: string }>(
        `SELECT s.reference_no FROM submission s JOIN assignment a ON a.id = s.assignment_id
         JOIN initiative i ON i.id = a.initiative_id
         WHERE s.status = 'submitted' AND (i.administering_agency = 'DYCD') = $1 ORDER BY s.reference_no LIMIT 1`,
        [inside],
      )
    )[0].reference_no;
  const [inside, outside] = [await reference(true), await reference(false)];
  await ownerQuery("UPDATE app_user SET scope_agencies = ARRAY['DYCD'] WHERE id = $1", [id]);
  const context = await browser.newContext({ storageState: authFile("grace") });
  try {
    const page = await context.newPage();
    await page.goto(`/finance/submissions?q=${inside}`);
    await expect(page.getByTestId("scope-note")).toHaveText("Showing initiatives in your access scope: DYCD");
    await expect(page.locator("table").getByText(inside)).toHaveCount(1);
    await page.goto(`/finance/submissions?q=${outside}`);
    await expect(page.locator("table").getByText(outside)).toHaveCount(0);
    await page.goto("/finance");
    await expect(page.getByTestId("scope-note")).toBeVisible();
  } finally {
    await context.close();
    await ownerQuery("UPDATE app_user SET scope_agencies = '{}' WHERE id = $1", [id]);
  }
});
