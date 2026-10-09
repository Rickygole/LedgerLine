import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";

test.use({ storageState: authFile("daniel") });

test("[US-044] starting a review and accepting a report show the new state without a reload", async ({ page }) => {
  const candidates = await ownerQuery<{ id: string }>(
    `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE s.status = 'submitted' AND a.org_id <> (SELECT org_id FROM app_user WHERE email = 'maria.santos@motthavenyouth.example.org')
     ORDER BY s.reference_no LIMIT 12`
  );
  expect(candidates.length).toBeGreaterThan(0);

  let accepted = false;
  for (const { id } of candidates) {
    await page.goto(`/finance/submissions/${id}`);
    await page.getByRole("button", { name: "Start review" }).click();
    await expect(page.getByRole("button", { name: "Start review" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Accept report" })).toBeEnabled();

    await page.getByRole("button", { name: "Accept report" }).click();
    const outcome = page.getByText("This report is accepted.").or(page.getByText(/Resolve these problems before accepting/));
    await expect(outcome).toBeVisible();
    if (await page.getByText("This report is accepted.").isVisible()) {
      accepted = true;
      break;
    }
  }
  expect(accepted).toBe(true);
  await expect(page.getByRole("button", { name: "Accept report" })).toHaveCount(0);
});
