import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

const CUSTOM = "Spring Site Audit";
let initiativeId = "";
let initiativeName = "";
let removedId = "";
let removedLabel = "";
let keptLabel = "";

test.beforeAll(async () => {
  const [row] = await ownerQuery<{ id: string; name: string; period: string; label: string; kept: string }>(
    `SELECT i.id, i.name, p.id AS period, p.label,
            (SELECT k.label FROM reporting_period k WHERE k.fiscal_year_id = 'FY27' AND k.initiative_id IS NULL AND k.id <> p.id LIMIT 1) AS kept
     FROM assignment a
     JOIN app_user u ON u.org_id = a.org_id AND u.email LIKE 'maria%'
     JOIN initiative i ON i.id = a.initiative_id
     JOIN reporting_period p ON p.fiscal_year_id = i.fiscal_year_id AND p.initiative_id IS NULL
     WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM submission s JOIN assignment a2 ON a2.id = s.assignment_id WHERE a2.initiative_id = i.id AND s.period_id = p.id)
     ORDER BY i.code, p.id DESC LIMIT 1`,
  );
  initiativeId = row.id;
  initiativeName = row.name;
  removedId = row.period;
  removedLabel = row.label;
  keptLabel = row.kept;
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
    await expect(page.getByRole("button", { name: /^Remove / }).first()).toBeVisible();
  });

  test("[US-002] removing a report from an initiative removes it from the organization's list and is recorded", async ({
    page,
    browser,
  }) => {
    await page.goto(`/finance/initiatives/${initiativeId}`);
    await page.getByRole("button", { name: `Remove ${removedLabel}` }).click();
    await expect(requiredRow(page, removedLabel)).toContainText("Not required");
    await expect(page.getByRole("status").filter({ hasText: `${removedLabel} is no longer required` })).toBeVisible();
    const [excluded] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM initiative_period_exclusion WHERE initiative_id = $1 AND period_id = $2",
      [initiativeId, removedId],
    );
    expect(excluded.n).toBe(1);
    const [audit] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_event WHERE entity_id = $1 AND action = 'required_report_removed'",
      [initiativeId],
    );
    expect(audit.n).toBe(1);

    const org = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
    const portal = await org.newPage();
    await expect(await portalLink(portal, keptLabel)).toHaveCount(1);
    await expect(await portalLink(portal, removedLabel)).toHaveCount(0);
    const gone = await portal.goto(
      `/portal/reports/new?assignment=${(await ownerQuery<{ id: string }>("SELECT a.id FROM assignment a JOIN app_user u ON u.org_id = a.org_id WHERE a.initiative_id = $1 AND u.email LIKE 'maria%'", [initiativeId]))[0].id}&period=${removedId}`,
    );
    expect(gone?.status()).toBe(404);
    await org.close();

    await page.getByRole("button", { name: `Add back ${removedLabel}` }).click();
    await expect(requiredRow(page, removedLabel)).toContainText("Required");
    await expect(page.getByRole("status").filter({ hasText: `${removedLabel} is required again.` })).toBeVisible();
  });

  test("[US-002] a custom-named report with its own due date reaches the organization and can be deleted", async ({
    page,
    browser,
  }) => {
    await page.goto(`/finance/initiatives/${initiativeId}`);
    await expect(page.getByLabel("Report name")).toHaveCount(0);
    await page.getByRole("button", { name: "Add a custom report" }).click();
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

    for (const path of ["/finance/initiatives", "/finance", "/finance/submissions", "/finance/trends"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(CUSTOM)).toHaveCount(0);
    }
    await page.goto(`/finance/initiatives/${initiativeId}`);

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

  test("[US-002] an organization cannot start a report for a retired initiative", async ({ browser }) => {
    const [target] = await ownerQuery<{ assignment: string }>(
      `SELECT a.id AS assignment FROM assignment a JOIN app_user u ON u.org_id = a.org_id AND u.email LIKE 'maria%'
       WHERE a.initiative_id = $1`,
      [initiativeId],
    );
    await ownerQuery("UPDATE initiative SET retired_on = '2026-10-01', retired_reason = 'Ended' WHERE id = $1", [
      initiativeId,
    ]);
    const org = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
    try {
      const portal = await org.newPage();
      await portal.goto(`/portal/reports/new?assignment=${target.assignment}&period=${removedId}`);
      await expect(portal.getByRole("heading", { name: "This initiative is no longer accepting reports" })).toBeVisible();
      await expect(portal.getByRole("button", { name: "Start report" })).toHaveCount(0);
    } finally {
      await ownerQuery("UPDATE initiative SET retired_on = NULL, retired_reason = NULL WHERE id = $1", [initiativeId]);
      await org.close();
    }
  });

  test("[US-002] a report that organizations have already started cannot be removed", async ({ page }) => {
    const [started] = await ownerQuery<{ initiative_id: string; code: string }>(
      `SELECT i.id AS initiative_id, i.code FROM submission s JOIN assignment a ON a.id = s.assignment_id
       JOIN initiative i ON i.id = a.initiative_id WHERE s.period_id = 'FY26-YE' ORDER BY i.code LIMIT 1`,
    );
    await page.goto(`/finance/initiatives/${started.initiative_id}`);
    await expect(page.getByRole("button", { name: "Remove FY26 Year-End" })).toBeDisabled();
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
    await expect(page.getByRole("button", { name: "Add a custom report" })).toHaveCount(0);
  });
});
