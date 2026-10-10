import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

const CODE = "CI-27-001";
const CUSTOM = "Spring Site Audit";
let initiativeId = "";
let initiativeName = "";

test.beforeAll(async () => {
  const [row] = await ownerQuery<{ id: string; name: string }>("SELECT id, name FROM initiative WHERE code = $1", [
    CODE,
  ]);
  initiativeId = row.id;
  initiativeName = row.name;
});

test.afterAll(async () => {
  await ownerQuery("DELETE FROM initiative_period_exclusion WHERE initiative_id = $1", [initiativeId]);
  const custom = await ownerQuery<{ id: string }>("SELECT id FROM reporting_period WHERE initiative_id = $1", [
    initiativeId,
  ]);
  for (const { id } of custom) {
    await ownerQuery("DELETE FROM reminder_rule WHERE period_id = $1", [id]);
    await ownerQuery("DELETE FROM reference_counter WHERE period_id = $1", [id]);
    await ownerQuery("DELETE FROM reporting_period WHERE id = $1", [id]);
  }
});

function requiredRow(page: Page, label: string) {
  return page.getByRole("row", { name: new RegExp(label) }).filter({ hasText: /Required|Not required/ });
}

async function portalLink(page: Page, periodLabel: string) {
  await page.goto("/portal");
  return page.getByRole("link", { name: new RegExp(`${initiativeName}, ${periodLabel}`) });
}

test.describe("as an administrator", () => {
  test.use({ storageState: authFile("priya") });

  test("[US-002] the initiative page lists the required reports, both standard periods by default", async ({
    page,
  }) => {
    await page.goto(`/finance/initiatives/${initiativeId}`);
    await expect(page.getByRole("heading", { name: "Required reports" })).toBeVisible();
    await expect(requiredRow(page, "FY27 Mid-Year")).toContainText("Required");
    await expect(requiredRow(page, "FY27 Year-End")).toContainText("Required");
  });

  test("[US-002] removing a report from an initiative removes it from the organization's list and is recorded", async ({
    page,
    browser,
  }) => {
    await page.goto(`/finance/initiatives/${initiativeId}`);
    await page.getByRole("button", { name: "Remove FY27 Year-End" }).click();
    await expect(requiredRow(page, "FY27 Year-End")).toContainText("Not required");
    const [excluded] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM initiative_period_exclusion WHERE initiative_id = $1 AND period_id = 'FY27-YE'",
      [initiativeId],
    );
    expect(excluded.n).toBe(1);
    const [audit] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_event WHERE entity_id = $1 AND action = 'required_report_removed'",
      [initiativeId],
    );
    expect(audit.n).toBe(1);

    const org = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
    const portal = await org.newPage();
    await expect(await portalLink(portal, "FY27 Mid-Year")).toHaveCount(1);
    await expect(await portalLink(portal, "FY27 Year-End")).toHaveCount(0);
    const gone = await portal.goto(
      `/portal/reports/new?assignment=${(await ownerQuery<{ id: string }>("SELECT a.id FROM assignment a JOIN app_user u ON u.org_id = a.org_id WHERE a.initiative_id = $1 AND u.email LIKE 'maria%'", [initiativeId]))[0].id}&period=FY27-YE`,
    );
    expect(gone?.status()).toBe(404);
    await org.close();

    await page.getByRole("button", { name: "Add back FY27 Year-End" }).click();
    await expect(requiredRow(page, "FY27 Year-End")).toContainText("Required");
  });

  test("[US-002] a custom-named report with its own due date reaches the organization and can be deleted", async ({
    page,
    browser,
  }) => {
    await page.goto(`/finance/initiatives/${initiativeId}`);
    await page.getByLabel("Report name").fill(CUSTOM);
    await page.getByLabel("Due date").fill("2027-03-31");
    await page.getByRole("button", { name: "Add report" }).click();
    await expect(page.getByText(`${CUSTOM} is now a required report for this initiative.`)).toBeVisible();
    const row = requiredRow(page, CUSTOM);
    await expect(row).toContainText("Custom report");
    await expect(row).toContainText("Mar 31, 2027");
    const [period] = await ownerQuery<{ id: string; due: string }>(
      "SELECT id, due_on::text AS due FROM reporting_period WHERE initiative_id = $1 AND label = $2",
      [initiativeId, CUSTOM],
    );
    expect(period.due).toBe("2027-03-31");

    const org = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
    const portal = await org.newPage();
    await expect(await portalLink(portal, CUSTOM)).toHaveCount(1);
    await org.close();

    const other = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM obligation WHERE period_id = $1 AND initiative_id <> $2",
      [period.id, initiativeId],
    );
    expect(other[0].n).toBe(0);

    await page.getByRole("button", { name: `Delete ${CUSTOM}` }).click();
    await expect(requiredRow(page, CUSTOM)).toHaveCount(0);
    const gone = await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM reporting_period WHERE id = $1", [
      period.id,
    ]);
    expect(gone[0].n).toBe(0);
  });

  test("[US-002] a report that organizations have already started cannot be removed", async ({ page }) => {
    const [started] = await ownerQuery<{ initiative_id: string; code: string }>(
      `SELECT i.id AS initiative_id, i.code FROM submission s JOIN assignment a ON a.id = s.assignment_id
       JOIN initiative i ON i.id = a.initiative_id WHERE s.period_id = 'FY27-MY' LIMIT 1`,
    );
    await page.goto(`/finance/initiatives/${started.initiative_id}`);
    await expect(page.getByRole("button", { name: "Remove FY27 Mid-Year" })).toBeDisabled();
  });
});

test.describe("as view-only Finance staff", () => {
  test.use({ storageState: authFile("grace") });

  test("[US-002] required reports are visible without any controls to change them", async ({ page }) => {
    await page.goto(`/finance/initiatives/${initiativeId}`);
    await expect(page.getByRole("heading", { name: "Required reports" })).toBeVisible();
    await expect(requiredRow(page, "FY27 Mid-Year")).toContainText("Required");
    await expect(page.getByRole("button", { name: /^Remove / })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add report" })).toHaveCount(0);
  });
});
