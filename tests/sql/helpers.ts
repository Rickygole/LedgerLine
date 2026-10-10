import "../../lib/load-env";
import { Client } from "pg";
import { sslFor } from "../../lib/db-ssl";

export function ownerUrl(): string {
  const url = process.env.TEST_DB_OWNER_URL ?? process.env.DB_OWNER_URL;
  if (!url) throw new Error("DB_OWNER_URL is not set");
  return url;
}

export function appUrl(): string {
  const url = process.env.TEST_APP_DATABASE_URL ?? process.env.APP_DATABASE_URL;
  if (!url) throw new Error("APP_DATABASE_URL is not set");
  return url;
}

export async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  return client;
}

export async function asUser<T>(app: Client, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    if (userId) await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId })]);
    return await fn();
  } finally {
    await app.query("ROLLBACK");
  }
}

export async function userId(owner: Client, emailPrefix: string): Promise<string> {
  const { rows } = await owner.query<{ id: string }>("SELECT id FROM app_user WHERE email LIKE $1 LIMIT 1", [
    `${emailPrefix}%`,
  ]);
  if (!rows[0]) throw new Error(`no user ${emailPrefix}`);
  return rows[0].id;
}

export async function errorCode(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}
