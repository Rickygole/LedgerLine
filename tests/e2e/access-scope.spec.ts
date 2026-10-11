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

test("[US-060][BR-017] a scoped Finance user cannot see out-of-scope initiatives or organizations", async ({
  browser,
}) => {
  const [{ id }] = await ownerQuery<{ id: string }>(
    "SELECT id FROM app_user WHERE email = 'grace.chen@finance.example.gov'",
  );
  const [outside] = await ownerQuery<{ id: string; code: string }>(
    `SELECT i.id, i.code FROM initiative i
     WHERE i.administering_agency = 'DFTA' AND EXISTS (SELECT 1 FROM assignment a WHERE a.initiative_id = i.id)
     ORDER BY i.code LIMIT 1`,
  );
  const [inside] = await ownerQuery<{ id: string; code: string }>(
    `SELECT i.id, i.code FROM initiative i
     WHERE i.administering_agency = 'DYCD' AND EXISTS (SELECT 1 FROM assignment a WHERE a.initiative_id = i.id)
     ORDER BY i.code LIMIT 1`,
  );
  const [foreignOrg] = await ownerQuery<{ id: string; legal_name: string }>(
    `SELECT o.id, o.legal_name FROM organization o
     WHERE EXISTS (SELECT 1 FROM assignment a WHERE a.org_id = o.id)
       AND NOT EXISTS (SELECT 1 FROM assignment a JOIN initiative i ON i.id = a.initiative_id
                       WHERE a.org_id = o.id AND i.administering_agency = 'DYCD')
     ORDER BY o.legal_name LIMIT 1`,
  );
  const [localOrg] = await ownerQuery<{ id: string; legal_name: string }>(
    `SELECT o.id, o.legal_name FROM organization o
     WHERE EXISTS (SELECT 1 FROM assignment a JOIN initiative i ON i.id = a.initiative_id
                   WHERE a.org_id = o.id AND i.administering_agency = 'DYCD')
     ORDER BY o.legal_name LIMIT 1`,
  );
  await ownerQuery("UPDATE app_user SET scope_agencies = ARRAY['DYCD'] WHERE id = $1", [id]);
  const context = await browser.newContext({ storageState: authFile("grace") });
  try {
    const page = await context.newPage();
    await page.goto(`/finance/initiatives?q=${outside.code}`);
    await expect(page.getByText("No initiatives match these filters.")).toBeVisible();
    await expect(page.getByText("No organizations", { exact: true })).toHaveCount(0);
    await page.goto(`/finance/initiatives?q=${inside.code}`);
    await expect(page.getByRole("row").filter({ hasText: inside.code })).toHaveCount(1);

    await page.goto("/finance/initiatives");
    const year = (await page.getByRole("heading", { name: /^FY\d+ initiatives/ }).innerText()).slice(0, 4);
    const [{ total, awards, everything }] = await ownerQuery<{ total: string; awards: number; everything: string }>(
      `SELECT (SELECT sum(total_funding)::text FROM initiative WHERE administering_agency = 'DYCD' AND fiscal_year_id = $1) AS total,
              (SELECT count(*)::int FROM assignment a JOIN initiative i ON i.id = a.initiative_id
                WHERE i.administering_agency = 'DYCD' AND i.fiscal_year_id = $1) AS awards,
              (SELECT sum(total_funding)::text FROM initiative WHERE fiscal_year_id = $1) AS everything`,
      [year],
    );
    const header = await page.locator("#initiatives p").first().innerText();
    expect(header).toContain(`across ${awards.toLocaleString("en-US")} awards`);
    expect(Number(everything)).toBeGreaterThan(Number(total));
    expect(header).toContain(`$${(Number(total) / 1_000_000).toFixed(1)} million`);

    expect((await page.goto(`/finance/initiatives/${outside.id}`))?.status()).toBe(404);
    expect((await page.goto(`/finance/initiatives/${inside.id}`))?.status()).toBe(200);
    expect((await page.goto(`/finance/organizations/${foreignOrg.id}`))?.status()).toBe(404);
    expect((await page.goto(`/finance/organizations/${localOrg.id}`))?.status()).toBe(200);
    await page.goto(`/finance/organizations?q=${encodeURIComponent(foreignOrg.legal_name)}`);
    await expect(page.getByRole("link", { name: foreignOrg.legal_name })).toHaveCount(0);
  } finally {
    await context.close();
    await ownerQuery("UPDATE app_user SET scope_agencies = '{}' WHERE id = $1", [id]);
  }
});
