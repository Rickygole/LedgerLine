import { expect, test } from "@playwright/test";
import { authFile, gotoStep, PEOPLE, savedNow } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

function numberIn(text: string | null): number {
  return Number((text ?? "").replace(/[^\d.-]/g, "") || 0);
}

test("[US-026] a table question shows a running total that updates as the submitter types", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("maria"),
  });
  const page = await context.newPage();
  const [draft] = await ownerQuery<{ id: string }>(
    `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE s.status = 'draft' AND a.org_id = (SELECT org_id FROM app_user WHERE email = $1) ORDER BY s.reference_no LIMIT 1`,
    [PEOPLE.maria],
  );
  await page.goto(`/portal/reports/${draft.id}`);
  await gotoStep(page, "Program performance");
  await page.getByRole("radio", { name: "Yes", exact: true }).first().check();
  const total = page.getByTestId("total-youth_breakdown-count");
  const live = page.locator("#q-youth_breakdown p[role='status']");

  await page.getByRole("button", { name: "Add row" }).first().click();
  await page.getByRole("button", { name: "Add row" }).first().click();
  await expect(total).toBeVisible();
  const baseline = numberIn(await total.textContent());
  const rowCount = await page.locator("#q-youth_breakdown li").count();
  const first = page.locator(`[id^='q-youth_breakdown-${rowCount - 2}-count']`);
  const second = page.locator(`[id^='q-youth_breakdown-${rowCount - 1}-count']`);

  await first.fill("1200");
  await expect(total).toHaveText(new RegExp(`Total Participants: ${(baseline + 1200).toLocaleString("en-US")}$`));
  await second.pressSequentially("300");
  await expect(total).toContainText((baseline + 1500).toLocaleString("en-US"));
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText(`Totals: Participants ${(baseline + 1500).toLocaleString("en-US")}.`);

  await first.fill("");
  await second.fill("");
  await expect(total).toContainText(baseline.toLocaleString("en-US"));
  await expect(savedNow(page)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: `Remove row ${rowCount} from Participants under 18 by age group` }).click();
  await page
    .getByRole("button", { name: `Remove row ${rowCount - 1} from Participants under 18 by age group` })
    .click();
  await context.close();
});

test.describe("as Finance staff", () => {
  test.use({ storageState: authFile("daniel") });

  test("[US-026] the Finance review of a submitted report shows the table total row", async ({ page }) => {
    const [row] = await ownerQuery<{ id: string; total: string }>(
      `SELECT s.id, sum((r ->> 'count')::numeric)::text AS total
       FROM submission s JOIN answer a ON a.submission_id = s.id AND a.question_key = 'youth_breakdown',
            jsonb_array_elements(a.value) r
       WHERE s.status = 'accepted' AND jsonb_array_length(a.value) > 1 AND (r ->> 'count') ~ '^[0-9]+$'
       GROUP BY s.id ORDER BY s.reference_no LIMIT 1`,
    );
    await page.goto(`/finance/submissions/${row.id}`);
    const footer = page
      .locator("tfoot")
      .filter({ hasText: new RegExp(`^Total.*${Number(row.total).toLocaleString("en-US")}`) });
    await expect(footer.first()).toBeVisible();
  });
});
