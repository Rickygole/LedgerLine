import { expect, test } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

test("[US-052] Add to outbox asks for confirmation with the number of organizations and queues nothing until confirmed", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("priya"),
  });
  const page = await context.newPage();
  const first = await page.goto("/finance/reminders");
  expect(first?.status()).toBe(200);
  const heading = await page
    .getByText(/^Preview for /)
    .first()
    .textContent();
  const today = new Date(`${(heading ?? "").replace("Preview for ", "")} 12:00:00 UTC`).toISOString().slice(0, 10);
  const created = await ownerQuery<{ id: string }>(
    `INSERT INTO reminder_rule (period_id, offset_days, template_subject, template_body)
     SELECT p.id, $1::date - p.due_on, 'Your {period} report is past due', 'Hello {contact}, your {period} report for {initiative} was due {due_date}.'
     FROM reporting_period p WHERE p.id = 'FY26-YE'
     ON CONFLICT (period_id, offset_days) DO UPDATE SET active = true RETURNING id`,
    [today],
  );
  const [rule] = await ownerQuery<{ period_id: string }>(
    "SELECT r.period_id FROM reminder_rule r JOIN reporting_period p ON p.id = r.period_id WHERE r.active AND p.due_on + r.offset_days = $1::date LIMIT 1",
    [today],
  );
  expect(created.length, `a rule fires on ${today}`).toBe(1);
  expect(rule, `an active rule fires on ${today}`).toBeTruthy();
  await page.goto(`/finance/reminders?period=${rule.period_id}`);
  const before = await ownerQuery<{ n: number }>(
    "SELECT count(*)::int AS n FROM outbox WHERE template = 'reminder' AND reminder_key LIKE '%:' || $1",
    [today],
  );
  await page.getByRole("button", { name: "Add to outbox" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Confirm adding reminders to the outbox" });
  await expect(dialog).toContainText(/This will add \d+ messages? to the outbox for \d+ organizations?/);
  const afterOpen = await ownerQuery<{ n: number }>(
    "SELECT count(*)::int AS n FROM outbox WHERE template = 'reminder' AND reminder_key LIKE '%:' || $1",
    [today],
  );
  expect(afterOpen[0].n).toBe(before[0].n);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Add to outbox" }).click();
  await dialog.getByRole("button", { name: /^Yes, add for/ }).click();
  await expect
    .poll(
      async () =>
        (
          await ownerQuery<{ n: number }>(
            "SELECT count(*)::int AS n FROM outbox WHERE template = 'reminder' AND reminder_key LIKE '%:' || $1",
            [today],
          )
        )[0].n,
    )
    .toBeGreaterThan(before[0].n);
  const body = await ownerQuery<{ body_text: string; full_name: string }>(
    `SELECT o.body_text, c.full_name FROM outbox o JOIN contact c ON c.org_id = o.org_id AND c.email = o.to_email
     WHERE o.template = 'reminder' AND o.reminder_key LIKE '%:' || $1 LIMIT 1`,
    [today],
  );
  expect(body[0].body_text.startsWith(`Hello ${body[0].full_name},`)).toBe(true);
  await page.goto("/finance/audit?action=reminders_queued");
  await expect(page.getByText(/queued reminders for FY\d{2} (Mid-Year|Year-End)/).first()).toBeVisible();
  await expect(page.getByText(/queued reminders for FY\d{2}-[A-Z]+/)).toHaveCount(0);
  await context.close();
});

test("[US-052] the seeded history shows what earlier rules sent", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: authFile("priya"),
  });
  const page = await context.newPage();
  await page.goto("/finance/reminders?period=FY26-YE");
  const rows = page.locator("tbody tr").filter({ hasText: /Past due/ });
  const lastRun = (await rows.first().locator("td").nth(4).textContent()) ?? "";
  const count = Number(lastRun.match(/(\d+) messages? queued/)?.[1] ?? 0);
  expect(count).toBeGreaterThan(0);
  await context.close();
});
