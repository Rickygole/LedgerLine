import "../../../lib/load-env";
import { Client } from "pg";
import { sslFor } from "../../../lib/db-ssl";

export async function ownerQuery<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const url = process.env.DB_OWNER_URL;
  if (!url) throw new Error("DB_OWNER_URL is not set");
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}
