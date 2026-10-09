import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DB_OWNER_URL;
  const password = process.env.APP_SERVER_PASSWORD;
  if (!url || !password) throw new Error("DB_OWNER_URL and APP_SERVER_PASSWORD are required");
  if (!/^[A-Za-z0-9_-]{24,}$/.test(password)) throw new Error("APP_SERVER_PASSWORD must be 24+ url-safe characters");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`ALTER ROLE app_server WITH LOGIN PASSWORD '${password}'`);
  const db = (await client.query<{ db: string }>("SELECT current_database() AS db")).rows[0].db;
  await client.query(`GRANT CONNECT ON DATABASE "${db}" TO app_server`);
  await client.end();
  console.log("app_server can now log in");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
