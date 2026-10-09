import { expect, test } from "@playwright/test";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from "docx";
import type { Page } from "@playwright/test";
import { authFile, PEOPLE, SAVED_LABEL } from "./support/app";
import { ownerQuery } from "./support/db";

test.describe.configure({ mode: "serial" });

async function openAnyDraft(page: Page): Promise<string> {
  const [draft] = await ownerQuery<{ id: string }>(
    `SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id
     WHERE s.status = 'draft' AND a.org_id = (SELECT org_id FROM app_user WHERE email = $1) ORDER BY s.reference_no LIMIT 1`,
    [PEOPLE.maria]
  );
  await page.goto(`/portal/reports/${draft.id}`);
  await expect(page.getByRole("button", { name: "Submit report" })).toBeVisible();
  return draft.id;
}

test("[BR-009][US-016] a start link that pairs an initiative with another year's period is not found and creates nothing", async ({ browser }) => {
  const [cross] = await ownerQuery<{ assignment_id: string; period_id: string }>(
    `SELECT a.id AS assignment_id, p.id AS period_id
     FROM assignment a JOIN initiative i ON i.id = a.initiative_id
     JOIN reporting_period p ON p.fiscal_year_id <> i.fiscal_year_id
     WHERE a.org_id = (SELECT org_id FROM app_user WHERE email = $1)
       AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = p.id)
     LIMIT 1`,
    [PEOPLE.maria]
  );
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
  const page = await context.newPage();
  const response = await page.goto(`/portal/reports/new?assignment=${cross.assignment_id}&period=${cross.period_id}`);
  expect(response?.status()).toBe(404);
  const rows = await ownerQuery("SELECT 1 FROM submission WHERE assignment_id = $1 AND period_id = $2", [cross.assignment_id, cross.period_id]);
  expect(rows).toHaveLength(0);
  await context.close();
});

test("[BR-021][US-031] a required table with only an empty row is refused", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
  const page = await context.newPage();
  await openAnyDraft(page);
  await page.getByRole("radio", { name: "Yes", exact: true }).first().check();
  await page.getByRole("button", { name: "Add row" }).first().click();
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByRole("alert").getByText("Fill in the participants under 18 by age group table.").first()).toBeVisible();
  await context.close();
});

test("[US-018] the resume prompt goes away once the user edits the report", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("maria") });
  const page = await context.newPage();
  const id = await openAnyDraft(page);
  await page.locator("#q-accomplishments").fill("Participants completed the curriculum.");
  await expect(page.getByText(SAVED_LABEL)).toBeVisible({ timeout: 20_000 });
  await page.goto(`/portal/reports/${id}`);
  const banner = page.getByText("Pick up where you left off");
  await expect(banner).toBeVisible();
  await page.locator("#q-accomplishments").fill("Participants completed the full curriculum.");
  await expect(banner).toHaveCount(0);
  await context.close();
});

test("[US-052] Send now asks for confirmation with the number of organizations and queues nothing until confirmed", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("priya") });
  const page = await context.newPage();
  const first = await page.goto("/finance/reminders");
  expect(first?.status()).toBe(200);
  const heading = await page.getByText(/^Preview for /).first().textContent();
  const today = new Date(`${(heading ?? "").replace("Preview for ", "")} 12:00:00 UTC`).toISOString().slice(0, 10);
  const [rule] = await ownerQuery<{ period_id: string }>(
    "SELECT r.period_id FROM reminder_rule r JOIN reporting_period p ON p.id = r.period_id WHERE r.active AND p.due_on + r.offset_days = $1::date LIMIT 1",
    [today]
  );
  expect(rule, `an active rule fires on ${today}`).toBeTruthy();
  await page.goto(`/finance/reminders?period=${rule.period_id}`);
  const before = await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM outbox WHERE template = 'reminder' AND reminder_key LIKE '%:' || $1", [today]);
  await page.getByRole("button", { name: "Send now" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Confirm sending reminders" });
  await expect(dialog).toContainText(/This will add \d+ emails? to the outbox for \d+ organizations?/);
  const afterOpen = await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM outbox WHERE template = 'reminder' AND reminder_key LIKE '%:' || $1", [today]);
  expect(afterOpen[0].n).toBe(before[0].n);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Send now" }).click();
  await dialog.getByRole("button", { name: /^Yes, send to/ }).click();
  await expect
    .poll(async () => (await ownerQuery<{ n: number }>("SELECT count(*)::int AS n FROM outbox WHERE template = 'reminder' AND reminder_key LIKE '%:' || $1", [today]))[0].n)
    .toBeGreaterThan(before[0].n);
  const body = await ownerQuery<{ body_text: string; full_name: string }>(
    `SELECT o.body_text, c.full_name FROM outbox o JOIN contact c ON c.org_id = o.org_id AND c.email = o.to_email
     WHERE o.template = 'reminder' AND o.reminder_key LIKE '%:' || $1 LIMIT 1`,
    [today]
  );
  expect(body[0].body_text.startsWith(`Hello ${body[0].full_name},`)).toBe(true);
  await context.close();
});

test("[US-052] the seeded history shows what earlier rules sent", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("priya") });
  const page = await context.newPage();
  await page.goto("/finance/reminders?period=FY26-YE");
  const rows = page.locator("tbody tr").filter({ hasText: /Past due/ });
  const sent = await rows.first().locator("td").nth(4).textContent();
  expect(Number(sent)).toBeGreaterThan(0);
  await context.close();
});

test("[US-003][US-007] a Word file imported without a model keeps its headings, table and choices and is not labelled AI", async ({ browser }) => {
  const cell = (text: string) => new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph(text)] });
  const buffer = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: "Tool Library Year-End Report", heading: HeadingLevel.TITLE }),
            new Paragraph({ text: "Section 1: Lending", heading: HeadingLevel.HEADING_1 }),
            new Paragraph("1. How many tools were lent this period?"),
            new Paragraph("2. Which tool types were lent most? (Garden / Power / Hand)"),
            new Paragraph("3. Did the library hold a repair night? Yes / No"),
            new Paragraph({ text: "Section 2: Locations", heading: HeadingLevel.HEADING_1 }),
            new Paragraph("4. List each lending location below."),
            new Table({
              width: { size: 9000, type: WidthType.DXA },
              rows: [new TableRow({ children: [cell("Location"), cell("Sessions held")] }), new TableRow({ children: [cell(""), cell("")] })],
            }),
          ],
        },
      ],
    })
  );
  const [form] = await ownerQuery<{ id: string; initiative_id: string }>(
    `INSERT INTO form_version (initiative_id, version, status, definition, source, created_by)
     SELECT f.initiative_id, max(f.version) + 1, 'draft', (array_agg(f.definition ORDER BY f.version DESC))[1], 'manual', (SELECT id FROM app_user WHERE email = $1)
     FROM form_version f JOIN initiative i ON i.id = f.initiative_id
     WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active' AND NOT EXISTS (SELECT 1 FROM form_version d WHERE d.initiative_id = f.initiative_id AND d.status = 'draft')
     GROUP BY f.initiative_id ORDER BY f.initiative_id LIMIT 1 RETURNING id, initiative_id`,
    [PEOPLE.priya]
  );
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: authFile("priya") });
  const page = await context.newPage();
  await page.goto(`/finance/forms/${form.id}?import=1`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "tool-library.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });
  await page.getByRole("button", { name: "Draft the form" }).click();
  await expect(page.getByText("0 of 4 reviewed").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("AI draft", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Drafted from the rules").first()).toBeVisible();
  await expect(page.getByText(/Columns: Location \(Short text\), Sessions held \(Whole number\)/)).toBeVisible();
  await expect(page.getByText("Which tool types were lent most?", { exact: true })).toBeVisible();
  await expect(page.getByText("Lending").first()).toBeVisible();
  for (let n = 0; n < 4; n += 1) await page.getByRole("button", { name: /^Accept / }).first().click();
  await page.getByRole("button", { name: /^Add 4 accepted questions/ }).click();
  await expect
    .poll(async () => (await ownerQuery<{ source: string }>("SELECT source FROM form_version WHERE id = $1", [form.id]))[0].source)
    .toBe("rule_draft");
  const [saved] = await ownerQuery<{ definition: { sections: { title: string; questions: { type: string; label: string }[] }[] } }>("SELECT definition FROM form_version WHERE id = $1", [form.id]);
  const titles = saved.definition.sections.map((section) => section.title);
  expect(titles).toEqual(expect.arrayContaining(["Lending", "Locations"]));
  const locations = saved.definition.sections.find((section) => section.title === "Locations");
  expect(locations?.questions.map((q) => q.type)).toEqual(["table"]);
  const [audit] = await ownerQuery<{ note: string }>("SELECT note FROM audit_event WHERE entity_id = $1 AND action = 'ai_draft_applied' ORDER BY at DESC LIMIT 1", [form.id]);
  expect(audit.note).toContain("from the uploaded Word file");
  await context.close();
});
