import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

const ADDED_EIN = "91-2345678";
const ADDED_NAME = "Riverside Reading Partners";
const IMPORT_NEW_EIN = "92-3456789";
const IMPORT_NEW_NAME = "Canal Street Arts Cooperative";
const HEADER =
  "ein,legal_name,org_type,borough,council_district,address_line,postal_code,contact_name,contact_title,contact_email,contact_phone";

test.afterAll(async () => {
  for (const ein of [ADDED_EIN, IMPORT_NEW_EIN]) {
    await ownerQuery("DELETE FROM contact WHERE org_id IN (SELECT id FROM organization WHERE ein = $1)", [ein]);
    await ownerQuery("DELETE FROM organization WHERE ein = $1", [ein]);
  }
});

test.describe("as an administrator", () => {
  test.use({ storageState: authFile("priya") });

  test("[US-033] the organizations page offers Add organization and Import master list", async ({ page }) => {
    await page.goto("/finance/organizations");
    await expect(page.getByRole("link", { name: "Add organization" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Import master list" })).toBeVisible();
  });

  test("[US-033] an administrator adds an organization with its primary contact", async ({ page }) => {
    await page.goto("/finance/organizations/new");
    await page.getByLabel("EIN").fill("12-345");
    await page.getByLabel("Legal name").fill(ADDED_NAME);
    await page.getByLabel("Type").selectOption("cbo");
    await page.getByLabel("Borough").selectOption("Brooklyn");
    await page.getByLabel("Council district").selectOption("35");
    await page.getByLabel("Address").fill("410 Bridge Street");
    await page.getByLabel("ZIP code").fill("11201");
    await page.getByLabel("Name", { exact: true }).fill("Dana Whitfield");
    await page.getByLabel("Title").fill("Executive Director");
    await page.getByLabel("Email").fill("dana@riversidereading.example.org");
    await page.getByRole("button", { name: "Add organization" }).click();
    await expect(page.getByText("The EIN must be 9 digits, like 12-3456789.").first()).toBeVisible();

    await page.getByLabel("EIN").fill(ADDED_EIN);
    await page.getByRole("button", { name: "Add organization" }).click();
    await page.waitForURL(/\/finance\/organizations\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: ADDED_NAME, level: 1 })).toBeVisible();
    const [org] = await ownerQuery<{ legal_name: string; borough: string; council_district: number }>(
      "SELECT legal_name, borough, council_district FROM organization WHERE ein = $1",
      [ADDED_EIN],
    );
    expect(org).toEqual({ legal_name: ADDED_NAME, borough: "Brooklyn", council_district: 35 });
    const [contact] = await ownerQuery<{ full_name: string; is_primary: boolean }>(
      "SELECT c.full_name, c.is_primary FROM contact c JOIN organization o ON o.id = c.org_id WHERE o.ein = $1",
      [ADDED_EIN],
    );
    expect(contact).toEqual({ full_name: "Dana Whitfield", is_primary: true });
    const [audit] = await ownerQuery<{ n: number }>(
      "SELECT count(*)::int AS n FROM audit_event WHERE entity = 'organization' AND action = 'org_add' AND after ->> 'ein' = $1",
      [ADDED_EIN],
    );
    expect(audit.n).toBe(1);
  });

  test("[US-033] an EIN that is already on the master list is refused", async ({ page }) => {
    await page.goto("/finance/organizations/new");
    await page.getByLabel("EIN").fill(ADDED_EIN);
    await page.getByLabel("Legal name").fill("Another Name Entirely");
    await page.getByLabel("Type").selectOption("cbo");
    await page.getByLabel("Borough").selectOption("Citywide");
    await page.getByLabel("Address").fill("1 Centre Street");
    await page.getByLabel("ZIP code").fill("10007");
    await page.getByLabel("Name", { exact: true }).fill("Dana Whitfield");
    await page.getByLabel("Title").fill("Director");
    await page.getByLabel("Email").fill("dana@example.org");
    await page.getByRole("button", { name: "Add organization" }).click();
    await expect(page.getByText(`This EIN is already on the master list for ${ADDED_NAME}.`).first()).toBeVisible();
    const [row] = await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM organization WHERE ein = $1", [
      ADDED_EIN,
    ]);
    expect(row.n).toBe(1);
  });

  test("[US-033] a CSV import shows what is new, updated and rejected before anything changes, then applies the confirmed list", async ({
    page,
  }) => {
    const [existing] = await ownerQuery<{
      ein: string;
      legal_name: string;
      org_type: string;
      borough: string;
      council_district: number | null;
      address_line: string;
      postal_code: string;
      full_name: string;
      title: string;
      email: string;
    }>(
      `SELECT o.ein, o.legal_name, o.org_type, o.borough, o.council_district, o.address_line, o.postal_code, c.full_name, c.title, c.email
       FROM organization o JOIN contact c ON c.org_id = o.id AND c.is_primary
       WHERE o.ein NOT IN ($1, $2) ORDER BY o.ein LIMIT 1`,
      [ADDED_EIN, IMPORT_NEW_EIN],
    );
    const newAddress = "77 Relocated Avenue";
    const csv = [
      HEADER,
      `${existing.ein},"${existing.legal_name}",${existing.org_type},${existing.borough},${existing.council_district ?? ""},"${newAddress}",${existing.postal_code},${existing.full_name},${existing.title},${existing.email},`,
      `${IMPORT_NEW_EIN},${IMPORT_NEW_NAME},Nonprofit,Manhattan,3,88 Canal Street,10002,Priti Shah,Director,priti@canalstreet.example.org,212-555-0198`,
      `99-12,Short EIN Organization,Nonprofit,Queens,25,1 Main Street,11373,Sam Lee,Director,sam@example.org,`,
    ].join("\n");
    const before = (await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM organization"))[0].n;

    await page.goto("/finance/organizations/import");
    await page.getByLabel("Or paste the list").fill(csv);
    await page.getByRole("button", { name: "Preview import" }).click();

    const summary = page.getByRole("list", { name: "Import summary" });
    await expect(summary).toContainText("1 new");
    await expect(summary).toContainText("1 updated");
    await expect(summary).toContainText("1 rejected");
    await expect(page.getByText("The EIN must be 9 digits, like 12-3456789.")).toBeVisible();
    await expect(page.getByText("Changes Address")).toBeVisible();
    await expect(page.getByText("Will be added to the master list")).toBeVisible();
    expect((await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM organization"))[0].n).toBe(before);

    await page.getByRole("button", { name: "Confirm import of 2 organizations" }).click();
    await expect(page.getByText(/Import finished: 1 added, 1 updated, 0 unchanged, 1 rejected/)).toBeVisible();

    expect((await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM organization"))[0].n).toBe(before + 1);
    const [updated] = await ownerQuery<{ address_line: string }>(
      "SELECT address_line FROM organization WHERE ein = $1",
      [existing.ein],
    );
    expect(updated.address_line).toBe(newAddress);
    const [added] = await ownerQuery<{ legal_name: string }>("SELECT legal_name FROM organization WHERE ein = $1", [
      IMPORT_NEW_EIN,
    ]);
    expect(added.legal_name).toBe(IMPORT_NEW_NAME);
    await ownerQuery("UPDATE organization SET address_line = $2 WHERE ein = $1", [existing.ein, existing.address_line]);
    const audits = await ownerQuery<{ action: string }>(
      "SELECT action FROM audit_event WHERE entity IN ('organization', 'master_list') AND action IN ('org_update', 'master_list_import') ORDER BY id",
    );
    expect(audits.map((a) => a.action)).toEqual(["org_update", "master_list_import"]);
  });
});

test.describe("as Finance staff who cannot change the master list", () => {
  test("[US-033] an analyst and a view-only user see no Add or Import controls and cannot open those pages", async ({
    browser,
  }) => {
    for (const who of ["daniel", "grace"] as const) {
      const context = await browser.newContext({
        baseURL: test.info().project.use.baseURL,
        storageState: authFile(who),
      });
      const page = await context.newPage();
      await page.goto("/finance/organizations");
      await expect(page.getByRole("heading", { name: "Organizations", level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "Add organization" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Import master list" })).toHaveCount(0);
      for (const path of ["/finance/organizations/new", "/finance/organizations/import"]) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(403);
      }
      await context.close();
    }
  });
});
