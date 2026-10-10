import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DB_OWNER_URL;
  if (!url) throw new Error("DB_OWNER_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migration");
  const applied = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migration (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }
  await client.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
