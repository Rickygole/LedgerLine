import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { sslFor } from "./db-ssl";

declare global {
  var ledgerPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.ledgerPool) {
    const connectionString = process.env.APP_DATABASE_URL;
    if (!connectionString) throw new Error("APP_DATABASE_URL is not set");
    globalThis.ledgerPool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 3),
      idleTimeoutMillis: 10_000,
      ssl: sslFor(connectionString),
    });
  }
  return globalThis.ledgerPool;
}

export type Tx = {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
};

function wrap(client: PoolClient): Tx {
  return {
    async query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params);
      return result.rows;
    },
    async one<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
      const result = await client.query<T>(sql, params);
      return (result.rows[0] as T | undefined) ?? null;
    },
  };
}

export async function withClaims<T>(sub: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub })]);
    const result = await fn(wrap(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function anonymous<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool().query<T>(sql, params);
  return result.rows;
}

export function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;
}
