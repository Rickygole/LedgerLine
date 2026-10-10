import { expect, test } from "@playwright/test";
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, WidthType } from "docx";
import { authFile, PEOPLE } from "./support/app";
import { ownerQuery } from "./support/db";

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
  await page.getByRole("button", { name: "Suggest questions" }).click();
  await expect(page.getByText("0 of 4 reviewed").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("AI draft", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/No model was used/).first()).toBeVisible();
  await expect(page.getByText("Suggested", { exact: true }).first()).toBeVisible();
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
