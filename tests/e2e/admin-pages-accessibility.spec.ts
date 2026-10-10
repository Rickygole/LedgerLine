import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./support/app";
import { ownerQuery } from "./support/db";
import { settle } from "./support/settle";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function serious(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} at ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(", ")}`,
    );
}

test.describe("automated accessibility checks for the question library, organization and initiative maintenance pages", () => {
  test.use({ storageState: authFile("priya") });

  test("administrator pages", async ({ page }) => {
    const [initiative] = await ownerQuery<{ id: string }>("SELECT id FROM initiative WHERE code = 'CI-27-001'");
    const paths = [
      "/finance/question-library",
      "/finance/question-library/new",
      "/finance/question-library/contact_name",
      "/finance/question-library/youth_breakdown",
      "/finance/organizations/new",
      "/finance/organizations/import",
      `/finance/initiatives/${initiative.id}`,
    ];
    for (const path of paths) {
      await page.goto(path);
      await settle(page);
      expect(await serious(page), path).toEqual([]);
    }
  });
});
