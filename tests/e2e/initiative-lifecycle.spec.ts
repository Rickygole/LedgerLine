import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

let initiative = { id: "", name: "", code: "" };

test.beforeAll(async () => {
  const [row] = await ownerQuery<{ id: string; name: string; code: string }>(
    `SELECT i.id, i.name, i.code FROM initiative i
     WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM assignment a JOIN app_user u ON u.org_id = a.org_id WHERE a.initiative_id = i.id AND u.email LIKE 'maria%')
       AND EXISTS (SELECT 1 FROM assignment a WHERE a.initiative_id = i.id)
       AND NOT EXISTS (SELECT 1 FROM initiative_lineage l WHERE l.predecessor_id = i.id)
     ORDER BY i.code DESC LIMIT 1`,
  );
  initiative = row;
});

test.afterAll(async () => {
  await ownerQuery(
    "UPDATE initiative SET name = $2, status = 'active', retired_on = NULL, retired_reason = NULL WHERE id = $1",
    [initiative.id, initiative.name],
  );
  await ownerQuery("DELETE FROM initiative_lineage WHERE predecessor_id = $1", [initiative.id]);
});

test.describe("as an administrator", () => {
  test.use({ storageState: authFile("priya") });

  test("[US-011] an administrator renames an initiative with a reason and the old name stays in its history", async ({
    page,
  }) => {
    const renamed = `${initiative.name} Collaborative`;
    await page.goto(`/finance/initiatives/${initiative.id}`);
    await page.getByLabel("New name").fill(renamed);
    await page.getByLabel("Reason").first().fill("The sponsor asked for the new name");
    await page.getByRole("button", { name: "Rename initiative" }).click();
    await expect(page.getByText(`The initiative is now named ${renamed}.`)).toBeVisible();
    await expect(page.getByRole("heading", { name: renamed, level: 1 })).toBeVisible();
    await expect(page.getByText(`Renamed from ${initiative.name} to ${renamed}`)).toBeVisible();

    const [row] = await ownerQuery<{ name: string; code: string }>("SELECT name, code FROM initiative WHERE id = $1", [
      initiative.id,
    ]);
    expect(row).toEqual({ name: renamed, code: initiative.code });
    const [lineage] = await ownerQuery<{ kind: string; successor_id: string; note: string }>(
      "SELECT kind, successor_id, note FROM initiative_lineage WHERE predecessor_id = $1",
      [initiative.id],
    );
    expect(lineage.kind).toBe("renamed");
    expect(lineage.successor_id).toBe(initiative.id);
    expect(lineage.note).toContain("The sponsor asked for the new name");
    const [audit] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_event WHERE entity = 'initiative' AND entity_id = $1 AND action = 'rename'",
      [initiative.id],
    );
    expect(audit.n).toBe(1);

    await page.goto("/finance/rollover/lineage?kind=renamed");
    await expect(page.getByText(renamed).first()).toBeVisible();
  });

  test("[US-011] a rename needs a reason", async ({ page }) => {
    await page.goto(`/finance/initiatives/${initiative.id}`);
    await page.getByLabel("New name").fill("Name Without A Reason");
    await page.getByRole("button", { name: "Rename initiative" }).click();
    await expect(page.getByText("Enter the reason.").first()).toBeVisible();
    const [row] = await ownerQuery<{ name: string }>("SELECT name FROM initiative WHERE id = $1", [initiative.id]);
    expect(row.name).not.toBe("Name Without A Reason");
  });

  test("[US-011] combining points to the annual rollover", async ({ page }) => {
    await page.goto(`/finance/initiatives/${initiative.id}`);
    await page.getByRole("link", { name: "Go to annual rollover" }).click();
    await expect(page).toHaveURL(/\/finance\/rollover$/);
  });

  test("[US-011] retiring an initiative records the reason, keeps its history and stops it accepting new reports", async ({
    page,
  }) => {
    await page.goto(`/finance/initiatives/${initiative.id}`);
    await expect(page.getByRole("heading", { name: "Danger zone" })).toBeVisible();
    await page.locator("#retire-reason").fill("The program ended mid-year");
    await page.getByRole("button", { name: "Retire initiative" }).click();
    const dialog = page.getByRole("dialog", { name: `Retire ${initiative.name}?` });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/\d+ organizations? will stop receiving reports and reminders/);
    await expect(dialog).toContainText("This cannot be undone.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: "Retire initiative" }).click();
    await dialog.getByRole("button", { name: "Yes, retire it" }).click();
    await expect(page.getByText(/This initiative is retired as of/)).toBeVisible();
    await expect(
      page
        .locator("main")
        .getByText(/Retired on .+ by .+\. Reason: The program ended mid-year/)
        .first(),
    ).toBeVisible();
    await expect(page.getByText(/Retired at the rollover/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit form (creates a draft)" })).toHaveCount(0);
    await expect(page.getByRole("note")).toContainText("Reason: The program ended mid-year");
    await expect(page.getByRole("button", { name: "Retire initiative" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rename initiative" })).toHaveCount(0);

    const [row] = await ownerQuery<{ status: string; retired_reason: string }>(
      "SELECT status, retired_reason FROM initiative WHERE id = $1",
      [initiative.id],
    );
    expect(row).toEqual({ status: "retired", retired_reason: "The program ended mid-year" });
    const [open] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM obligation WHERE initiative_id = $1 AND submission_id IS NULL",
      [initiative.id],
    );
    expect(open.n).toBe(0);
    const [kept] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM assignment WHERE initiative_id = $1",
      [initiative.id],
    );
    expect(kept.n).toBeGreaterThan(0);
    const [lineage] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM initiative_lineage WHERE predecessor_id = $1 AND kind = 'retired' AND successor_id IS NULL",
      [initiative.id],
    );
    expect(lineage.n).toBe(1);
    await expect(page.getByText("Retired", { exact: true }).first()).toBeVisible();
    await page.goto("/finance/rollover/lineage?kind=retired");
    await expect(page.getByRole("heading", { name: "Lineage", level: 1 })).toBeVisible();
  });
});

test.describe("as view-only Finance staff", () => {
  test.use({ storageState: authFile("grace") });

  test("[US-011] there is no way to rename or retire an initiative", async ({ page }) => {
    await page.goto(`/finance/initiatives/${initiative.id}`);
    await expect(page.getByRole("heading", { name: "Name and status" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rename initiative" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retire initiative" })).toHaveCount(0);
    await expect(page.getByText("History")).toBeVisible();
  });
});
