import "dotenv/config";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import * as XLSX from "xlsx";

const OUT = path.resolve(__dirname, "../fixtures/demo-desk");
const TEMPLATES = path.resolve(__dirname, "../fixtures/templates");
const MB = 1024 * 1024;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function mariaAward(): Promise<{ award: number; initiative: string }> {
  const url = process.env.DB_OWNER_URL;
  if (!url) throw new Error("DB_OWNER_URL is not set. Pass --award <dollars> instead.");
  const client = new Client({ connectionString: url, ssl: url.includes("localhost") ? undefined : true });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT a.award_amount::float8 AS award, i.name AS initiative
       FROM assignment a JOIN initiative i ON i.id = a.initiative_id
       WHERE a.org_id = (SELECT org_id FROM app_user WHERE email = 'maria.santos@motthavenyouth.example.org')
         AND EXISTS (SELECT 1 FROM form_version f WHERE f.initiative_id = a.initiative_id AND f.status = 'published')
       ORDER BY a.award_amount DESC LIMIT 1`
    );
    if (!rows[0]) throw new Error("No assignment found for Maria. Run pnpm db:seed first.");
    return rows[0];
  } finally {
    await client.end();
  }
}

function lines(award: number, extra: number): { category: string; description: string; amount: number }[] {
  const cents = (value: number) => Math.round(value * 100) / 100;
  const base = [
    { category: "PS", description: "Program director salary", share: 0.34 },
    { category: "PS", description: "Youth coordinators", share: 0.26 },
    { category: "PS", description: "Fringe benefits", share: 0.12 },
    { category: "OTPS", description: "Program supplies", share: 0.1 },
    { category: "OTPS", description: "Field trip transportation", share: 0.08 },
    { category: "OTPS", description: "Facility rental", share: 0.1 },
  ];
  const rows = base.map((row) => ({ category: row.category, description: row.description, amount: cents(award * row.share) }));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  rows[rows.length - 1].amount = cents(rows[rows.length - 1].amount + (award - total) + extra);
  return rows;
}

function workbook(rows: { category: string; description: string; amount: number }[], file: string) {
  const sheet = XLSX.utils.json_to_sheet(rows.map((row) => ({ Category: row.category, Description: row.description, Amount: row.amount })));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Budget");
  XLSX.writeFile(book, path.join(OUT, file));
}

function pdfOfSize(file: string, bytes: number) {
  const head = Buffer.from("%PDF-1.4\n%demo attachment\n");
  const body = Buffer.alloc(bytes - head.length, 32);
  writeFileSync(path.join(OUT, file), Buffer.concat([head, body]));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const given = argument("award");
  const { award, initiative } = given ? { award: Number(given), initiative: "the award given on the command line" } : await mariaAward();
  if (!Number.isFinite(award) || award <= 0) throw new Error("The award must be a positive number of dollars.");
  workbook(lines(award, 1750), "budget-over-award.xlsx");
  workbook(lines(award, 0), "budget-balanced.xlsx");
  pdfOfSize("scan-31MB.pdf", 31 * MB);
  pdfOfSize("scan-24MB.pdf", 24 * MB);
  copyFileSync(path.join(TEMPLATES, "senior-digital-literacy-report.docx"), path.join(OUT, "legacy-template.docx"));
  copyFileSync(path.join(TEMPLATES, "food-pantry-report-injected.docx"), path.join(OUT, "legacy-template-held-out.docx"));
  console.log(`Wrote demo files to ${OUT}`);
  console.log(`Budget files are sized for ${initiative}, award $${award.toLocaleString("en-US", { minimumFractionDigits: 2 })}.`);
  console.log("budget-over-award.xlsx is $1,750.00 over the award. budget-balanced.xlsx equals it.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
