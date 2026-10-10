import { expect, type Page } from "@playwright/test";

export const PASSCODE = process.env.GATE_PASSCODE ?? "ledger-demo";
export const PASSWORD = "ledgerline-demo";

export const PEOPLE = {
  maria: "maria.santos@motthavenyouth.example.org",
  daniel: "daniel.cho@finance.example.gov",
  priya: "priya.raman@finance.example.gov",
  grace: "grace.chen@finance.example.gov",
};

export const SAVED_LABEL = /^Saved (\d{1,2}:\d{2} [AP]M|[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M)/;

export const AUTH_DIR = "reports/auth";

export function authFile(who: keyof typeof PEOPLE): string {
  return `${AUTH_DIR}/${who}.json`;
}

export async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/gate");
  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await page.getByRole("link", { name: "Start now" }).click();
  await page.waitForURL(/\/login/);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(portal|finance)/);
}

export async function openOverdueDraft(page: Page) {
  await page.goto("/portal");
  await page.getByRole("link", { name: "Continue report" }).first().click();
  await page.waitForURL(/\/portal\/reports\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("button", { name: "Submit report" })).toBeVisible();
  return page.url().split("/").pop() as string;
}

const FILL: Record<string, string> = {
  "q-contact_name": "Maria Santos",
  "q-contact_title": "Program Director",
  "q-contact_email": PEOPLE.maria,
  "q-contact_phone": "718-555-0142",
  "q-participants_target": "120",
  "q-participants_actual": "104",
  "q-sites_count": "3",
  "q-youth_program_hours": "1450",
  "q-youth_completion_rate": "86",
  "q-accomplishments": "Participants completed the full curriculum and 31 mentors were matched during the period.",
};

export async function fillRequiredAnswers(page: Page) {
  for (const [id, value] of Object.entries(FILL)) {
    const field = page.locator(`#${id}`);
    if ((await field.count()) === 0) continue;
    if ((await field.inputValue()) === "") await field.fill(value);
  }
  const delivery = page.locator("#q-delivery_model");
  if ((await delivery.count()) && (await delivery.inputValue()) === "") await delivery.selectOption("In person");
  const youth = page.getByRole("radio", { name: "No", exact: true });
  if ((await youth.count()) && !(await youth.first().isChecked())) await youth.first().check();
  await certify(page);
}

export async function certify(page: Page) {
  const box = page.getByRole("checkbox", { name: /certify this report/i });
  if (!(await box.isChecked())) await box.check();
  const name = page.getByLabel("Certifier name");
  if ((await name.inputValue()) === "") await name.fill("Maria Santos");
  const title = page.getByLabel("Certifier title");
  if ((await title.inputValue()) === "") await title.fill("Program Director");
}

export async function setBudget(page: Page, lines: { category: "PS" | "OTPS"; description: string; amount: string; actual?: string }[]) {
  const existing = await page.getByRole("button", { name: /^Remove line/ }).count();
  for (let i = 0; i < existing; i++) await page.getByRole("button", { name: "Remove line 1" }).first().click();
  for (const [index, line] of lines.entries()) {
    await page.getByRole("button", { name: "Add line" }).click();
    const n = index + 1;
    await page.getByLabel(`Line ${n} Category`, { exact: false }).selectOption(line.category);
    await page.getByLabel(`Line ${n} Description`).fill(line.description);
    await page.getByLabel(`Line ${n} Approved budget`).fill(line.amount);
    await page.getByLabel(`Line ${n} Approved budget`).blur();
    await page.getByLabel(`Line ${n} Actual spent`).fill(line.actual ?? line.amount);
    await page.getByLabel(`Line ${n} Actual spent`).blur();
  }
}

export async function submitOverdueDraft(page: Page): Promise<string> {
  const id = await openOverdueDraft(page);
  await fillRequiredAnswers(page);
  await setBudget(page, [
    { category: "PS", description: "Mentor stipends", amount: "60000" },
    { category: "OTPS", description: "Program supplies", amount: "25000" },
  ]);
  await expect(page.getByText(SAVED_LABEL)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Submit report" }).click();
  await page.waitForURL(/\/submitted$/);
  return id;
}
