import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import { authFile } from "./support/app";

test.use({ storageState: authFile("daniel") });

test("[US-048][US-046] a query says how many of its matches the Excel export includes, and the export has exactly that many rows", async ({
  page,
}) => {
  await page.goto("/finance/queries?period=FY26-YE");
  const note = page.getByTestId("export-note");
  await expect(note).toHaveText(/^\d+ matches?, \d+ submitted reports? included in the export$/);
  const [, matches, exportable] = (await note.textContent())!.match(/^(\d+) matches?, (\d+) submitted/)!;
  expect(Number(exportable)).toBeLessThan(Number(matches));
  await expect(page.getByTestId("match-count")).toHaveText(matches);

  const href = await page.getByRole("link", { name: "Export Excel" }).getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  const book = XLSX.read(await response.body(), { type: "buffer" });
  expect(XLSX.utils.sheet_to_json(book.Sheets["Submissions"]).length).toBe(Number(exportable));

  await page.getByRole("link", { name: "Open results" }).click();
  await expect(page).toHaveURL(/\/finance\/submissions\?/);
  await expect(page.getByTestId("export-note")).toContainText(
    `${matches} matches, ${exportable} submitted reports included in the export`,
  );
});
