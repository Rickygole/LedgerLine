import "dotenv/config";
import { chromium, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import { startReport } from "../lib/report/create";
import { checkUpload } from "../lib/storage";
import { fillRequiredAnswers, gotoStep, PEOPLE, setBudget, signIn } from "../tests/e2e/support/app";

type Outcome = { refused: boolean; plain: string; raw: string };
type Attack = { label: string; run: () => Promise<Outcome> };

const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? "3105"}`;
const RULES = ["BR-022", "BR-010", "BR-021", "BR-012", "BR-019", "US-057"] as const;

function url(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function connect(connection: string): Promise<Client> {
  const client = new Client({ connectionString: connection, ssl: connection.includes("localhost") ? undefined : true });
  await client.connect();
  return client;
}

function rawOf(error: unknown): string {
  const e = error as { code?: string; message?: string };
  return `${e.code ? `${e.code} ` : ""}${e.message ?? String(error)}`;
}

async function asUser<T>(app: Client, userId: string, fn: () => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
    return await fn();
  } finally {
    await app.query("ROLLBACK");
  }
}

async function refusedBy(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return rawOf(error);
  }
}

type Scratch = { id: string; award: number; created: boolean };

async function scratchDraft(owner: Client, mariaId: string): Promise<Scratch> {
  const { rows } = await owner.query(
    `SELECT a.id, a.award_amount::float8 AS award FROM assignment a
     JOIN initiative i ON i.id = a.initiative_id
     JOIN reporting_period p ON p.fiscal_year_id = i.fiscal_year_id AND p.id = 'FY27-MY'
     WHERE a.org_id = (SELECT org_id FROM app_user WHERE id = $1)
       AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = 'FY27-MY')
       AND EXISTS (SELECT 1 FROM form_version f WHERE f.initiative_id = a.initiative_id AND f.status = 'published')
     ORDER BY a.id LIMIT 1`,
    [mariaId],
  );
  if (!rows[0]) throw new Error("No assignment is free for a scratch report. Reseed with pnpm db:seed.");
  const result = await startReport(mariaId, rows[0].id, "FY27-MY");
  if (result.status !== "ok") throw new Error(`Could not start a scratch report: ${result.status}`);
  return { id: result.submissionId, award: rows[0].award, created: true };
}

async function discard(owner: Client, scratch: Scratch) {
  for (const table of ["answer", "budget_line", "attachment", "flag", "outbox"]) {
    await owner.query(`DELETE FROM ${table} WHERE submission_id = $1`, [scratch.id]);
  }
  await owner.query("DELETE FROM submission WHERE id = $1 AND status = 'draft'", [scratch.id]);
}

async function alertText(page: Page): Promise<string> {
  const alert = page
    .getByRole("alert")
    .filter({ hasText: /problem|must equal|enter/i })
    .first();
  await alert.waitFor({ timeout: 15_000 });
  return (await alert.innerText()).replace(/\s+/g, " ").trim();
}

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function main() {
  const rule = (process.argv[2] ?? "").toUpperCase();
  if (!(RULES as readonly string[]).includes(rule)) {
    console.error(`Usage: pnpm break <rule>. Rules: BR-022, BR-010, BR-021, BR-012, BR-019 (also US-057).`);
    process.exit(2);
  }

  const owner = await connect(url("DB_OWNER_URL"));
  const app = await connect(url("APP_DATABASE_URL"));
  const idOf = async (email: string) =>
    (await owner.query("SELECT id FROM app_user WHERE email = $1", [email])).rows[0].id as string;
  const maria = await idOf(PEOPLE.maria);
  const daniel = await idOf(PEOPLE.daniel);

  let browser: Browser | null = null;
  let scratch: Scratch | null = null;
  const attacks: Attack[] = [];

  const withMariaPage = async <T>(fn: (page: Page) => Promise<T>): Promise<T> => {
    browser ??= await chromium.launch();
    const context = await browser.newContext({ baseURL: BASE_URL });
    try {
      const page = await context.newPage();
      await signIn(page, PEOPLE.maria);
      return await fn(page);
    } finally {
      await context.close();
    }
  };

  try {
    if (rule === "BR-022") {
      scratch = await scratchDraft(owner, maria);
      const draft = scratch;
      attacks.push({
        label: "Submit a budget that is short of the award",
        run: () =>
          withMariaPage(async (page) => {
            await page.goto(`/portal/reports/${draft.id}`);
            await fillRequiredAnswers(page);
            const ps = Math.round(draft.award * 0.7);
            const otps = Math.round(draft.award * 0.1);
            await setBudget(page, [
              { category: "PS", description: "Staff", amount: String(ps) },
              { category: "OTPS", description: "Supplies", amount: String(otps) },
            ]);
            await gotoStep(page, "Review and submit");
            await page.getByRole("button", { name: "Submit report" }).click();
            const text = await alertText(page);
            const after = (await owner.query("SELECT status FROM submission WHERE id = $1", [draft.id])).rows[0].status;
            const balanceLine =
              /Total \$[\d,]+\.\d{2} must equal award \$[\d,]+\.\d{2} \((?:over|under) by \$[\d,]+\.\d{2}\)\./.exec(
                text,
              )?.[0];
            return {
              refused: after === "draft" && Boolean(balanceLine),
              plain: `A budget of ${money(ps + otps)} against an award of ${money(draft.award)} was refused at submit and the report stayed a draft.`,
              raw: balanceLine ?? text,
            };
          }),
      });
      attacks.push({
        label: "Call the database's submit function directly with a budget short of the award",
        run: async () => {
          const short = Math.round(draft.award * 0.5);
          const raw = await asUser(app, maria, async () => {
            await app.query("DELETE FROM budget_line WHERE submission_id = $1", [draft.id]);
            await app.query(
              "INSERT INTO budget_line (submission_id, row_id, position, category, description, amount) VALUES ($1, gen_random_uuid(), 1, 'PS', 'Staff', $2)",
              [draft.id, short],
            );
            const lock = (await app.query("SELECT lock_version FROM submission WHERE id = $1", [draft.id])).rows[0]
              .lock_version;
            const snapshot = {
              formVersionId: "break",
              answers: {},
              budget: [{ position: 1, category: "PS", description: "Staff", amount: short }],
              attachments: [],
            };
            return refusedBy(() =>
              app.query("SELECT * FROM app.transition_submission($1, 'submit', $2, $3::jsonb, NULL, NULL, NULL)", [
                draft.id,
                lock,
                JSON.stringify(snapshot),
              ]),
            );
          });
          return {
            refused: raw !== null && raw.includes("must equal the award"),
            plain: "A submit sent straight to the database with a short budget was refused by the database itself, with no application code involved.",
            raw: raw ?? "submit succeeded",
          };
        },
      });
    }

    if (rule === "BR-010") {
      const foreign = (
        await owner.query(
          `SELECT s.id, o.ein FROM submission s JOIN assignment a ON a.id = s.assignment_id JOIN organization o ON o.id = a.org_id
           WHERE a.org_id <> (SELECT org_id FROM app_user WHERE id = $1) LIMIT 1`,
          [maria],
        )
      ).rows[0];
      attacks.push({
        label: "Open another organization's report by its address",
        run: () =>
          withMariaPage(async (page) => {
            const response = await page.goto(`/portal/reports/${foreign.id}`);
            const status = response?.status() ?? 0;
            return {
              refused: status === 404,
              plain: "Another organization's report address returned not found to Maria.",
              raw: `HTTP ${status} for /portal/reports/${foreign.id}`,
            };
          }),
      });
      attacks.push({
        label: "Read other organizations' reports straight from the database",
        run: async () => {
          const total = (await owner.query("SELECT count(*)::int AS n FROM submission")).rows[0].n as number;
          const visible = await asUser(app, maria, async () => {
            const rows = await app.query(
              "SELECT count(*)::int AS n FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE a.org_id <> app.org_id()",
            );
            return rows.rows[0].n as number;
          });
          return {
            refused: visible === 0,
            plain: "Row-level security showed Maria none of the other organizations' reports.",
            raw: `${visible} foreign rows visible, ${total} rows exist in total`,
          };
        },
      });
      attacks.push({
        label: "Ask for a stored file under another organization's EIN",
        run: async () => {
          const ok = await asUser(
            app,
            maria,
            async () =>
              (await app.query("SELECT app.can_access_path($1) AS ok", [`${foreign.ein}/x/file.pdf`])).rows[0]
                .ok as boolean,
          );
          return {
            refused: ok === false,
            plain: "A storage path under another organization's EIN was refused.",
            raw: `app.can_access_path('${foreign.ein}/x/file.pdf') = ${ok}`,
          };
        },
      });
    }

    if (rule === "BR-021") {
      scratch = await scratchDraft(owner, maria);
      const draft = scratch;
      attacks.push({
        label: "Submit a report with nothing filled in",
        run: () =>
          withMariaPage(async (page) => {
            await page.goto(`/portal/reports/${draft.id}`);
            await gotoStep(page, "Review and submit");
            await page.getByRole("button", { name: "Submit report" }).click();
            const text = await alertText(page);
            const after = (await owner.query("SELECT status FROM submission WHERE id = $1", [draft.id])).rows[0].status;
            const count = /(\d+) problems?/.exec(text)?.[1] ?? "some";
            return {
              refused: after === "draft",
              plain: `The empty report was refused with ${count} problems listed, and it stayed a draft.`,
              raw: text,
            };
          }),
      });
    }

    if (rule === "BR-012") {
      scratch = await scratchDraft(owner, maria);
      const draft = scratch;
      attacks.push({
        label: "Add a 26 MB file in the browser",
        run: () =>
          withMariaPage(async (page) => {
            await page.goto(`/portal/reports/${draft.id}`);
            await gotoStep(page, "Attachments");
            await page.locator("#attachment-input").setInputFiles({
              name: "scan.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(26 * 1024 * 1024, 66)]),
            });
            const message = page.getByText(/over the 25\.0 MB limit for one file/).first();
            await message.waitFor({ timeout: 15_000 });
            const stored = (
              await owner.query("SELECT count(*)::int AS n FROM attachment WHERE submission_id = $1", [draft.id])
            ).rows[0].n as number;
            return {
              refused: stored === 0,
              plain: "A 26 MB file was refused before it was sent, with its size and the limit stated.",
              raw: (await message.innerText()).trim(),
            };
          }),
      });
      attacks.push({
        label: "Send a 31 MB file to the server upload check",
        run: async () => {
          const problem = checkUpload("scan.pdf", 31 * 1024 * 1024);
          return {
            refused: problem !== null,
            plain: "The server upload check refused a 31 MB file and stated the size.",
            raw: problem ?? "accepted",
          };
        },
      });
    }

    if (rule === "BR-019" || rule === "US-057") {
      attacks.push({
        label: "Rewrite an audit event as an analyst",
        run: async () => {
          const raw = await asUser(app, daniel, () =>
            refusedBy(() =>
              app.query("UPDATE audit_event SET note = 'edited' WHERE id = (SELECT min(id) FROM audit_event)"),
            ),
          );
          return {
            refused: raw !== null,
            plain: "An analyst's attempt to edit an audit event was refused by the database.",
            raw: raw ?? "update succeeded",
          };
        },
      });
      attacks.push({
        label: "Delete a submitted revision as an analyst",
        run: async () => {
          const raw = await asUser(app, daniel, () =>
            refusedBy(() =>
              app.query("DELETE FROM submission_revision WHERE id = (SELECT min(id) FROM submission_revision)"),
            ),
          );
          return {
            refused: raw !== null,
            plain: "An analyst's attempt to delete a submitted revision was refused by the database.",
            raw: raw ?? "delete succeeded",
          };
        },
      });
      attacks.push({
        label: "Edit an audit event as the database owner",
        run: async () => {
          await owner.query("BEGIN");
          try {
            const raw = await refusedBy(() =>
              owner.query("UPDATE audit_event SET note = 'edited' WHERE id = (SELECT min(id) FROM audit_event)"),
            );
            return {
              refused: raw !== null,
              plain: "Even the table owner's edit of an audit event was rejected by the append-only trigger.",
              raw: raw ?? "update succeeded",
            };
          } finally {
            await owner.query("ROLLBACK");
          }
        },
      });
    }

    let failed = 0;
    console.log(`Attacks on ${rule} against ${BASE_URL}`);
    for (const attack of attacks) {
      const outcome = await attack.run();
      if (!outcome.refused) failed += 1;
      console.log(`\n${attack.label}`);
      console.log(`  ${outcome.refused ? "REFUSED" : "NOT REFUSED"}: ${outcome.plain}`);
      console.log(`  raw: ${outcome.raw}`);
    }
    console.log(
      failed === 0
        ? `\nAll ${attacks.length} attempts on ${rule} were refused.`
        : `\n${failed} attempt${failed > 1 ? "s" : ""} on ${rule} got through.`,
    );
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    if (scratch) await discard(owner, scratch).catch((error) => console.error(`cleanup failed: ${rawOf(error)}`));
    await (browser as Browser | null)?.close();
    await app.end();
    await owner.end();
  }
}

main().catch((error) => {
  console.error(rawOf(error));
  process.exit(1);
});
