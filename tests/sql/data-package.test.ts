import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPackage, undocumented, type CatalogColumn } from "@/lib/export/package";
import { NOT_EXPORTED } from "@/lib/export/dictionary";
import { appUrl, asUser, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;
let daniel: string;
let maria: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
  daniel = await userId(owner, "daniel.cho");
  maria = await userId(owner, "maria.santos");
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function code(fn: () => Promise<unknown>): Promise<string | null> {
  await app.query("SAVEPOINT attempt");
  try {
    await fn();
    await app.query("RELEASE SAVEPOINT attempt");
    return null;
  } catch (error) {
    await app.query("ROLLBACK TO SAVEPOINT attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe("[US-055][BR-020] the Council can take a complete, documented copy of its data", () => {
  it("covers every business table in the database, and names the ones it leaves out", async () => {
    const all = (
      await owner.query(
        "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1",
      )
    ).rows.map((r) => r.relname as string);
    await asUser(app, priya, async () => {
      const exported = (await app.query("SELECT DISTINCT table_name FROM app.export_catalog() ORDER BY 1")).rows.map(
        (r) => r.table_name as string,
      );
      const left = NOT_EXPORTED.map((n) => n.table).sort();
      expect([...exported, ...left].sort()).toEqual(all);
      expect(exported.length).toBeGreaterThanOrEqual(35);
      for (const table of [
        "organization",
        "initiative",
        "form_version",
        "submission",
        "answer",
        "budget_line",
        "audit_event",
        "outbox",
        "app_user",
        "support_request",
        "security_incident",
        "annual_review",
        "uat_session",
        "training_record",
        "saved_query",
      ]) {
        expect(exported).toContain(table);
      }
    });
  });

  it("documents every table and every column", async () => {
    await asUser(app, priya, async () => {
      const catalog = (
        await app.query<CatalogColumn>(
          "SELECT table_name, column_name, data_type, is_nullable, ordinal FROM app.export_catalog()",
        )
      ).rows;
      expect(undocumented(catalog)).toEqual([]);
    });
  });

  it("returns every row of every table, including rows that row-level security hides from the administrator's own queries", async () => {
    await asUser(app, priya, async () => {
      const tables = (await app.query("SELECT DISTINCT table_name FROM app.export_catalog() ORDER BY 1")).rows.map(
        (r) => r.table_name as string,
      );
      for (const table of tables) {
        const exported = (await app.query("SELECT count(*)::int AS n FROM app.export_rows($1)", [table])).rows[0].n;
        const actual = (await owner.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
        expect(exported, table).toBe(actual);
      }
      const visible = (await app.query("SELECT count(*)::int AS n FROM saved_query")).rows[0].n;
      const exported = (await app.query("SELECT count(*)::int AS n FROM app.export_rows('saved_query')")).rows[0].n;
      expect(exported).toBeGreaterThanOrEqual(visible);
    });
  });

  it("never exports credentials: no password hash, session counter, token or throttle table", async () => {
    await asUser(app, priya, async () => {
      const columns = (await app.query("SELECT table_name, column_name FROM app.export_catalog()")).rows;
      expect(columns.some((c) => c.column_name === "password_hash" || c.column_name === "session_version")).toBe(false);
      expect(columns.some((c) => ["password_token", "revoked_session", "auth_attempt"].includes(c.table_name))).toBe(
        false,
      );
      const rows = (await app.query("SELECT app.export_rows('app_user') AS row LIMIT 5")).rows;
      for (const { row } of rows) expect(Object.keys(row)).not.toContain("password_hash");
      expect(await code(() => app.query("SELECT app.export_rows('password_token')"))).toBe("23514");
      expect(await code(() => app.query("SELECT app.export_rows('pg_authid')"))).toBe("23514");
    });
  });

  it("builds a package whose manifest lists every table with the stored row counts", async () => {
    await asUser(app, priya, async () => {
      const catalog = (
        await app.query<CatalogColumn>(
          "SELECT table_name, column_name, data_type, is_nullable, ordinal FROM app.export_catalog()",
        )
      ).rows;
      const rows: Record<string, Record<string, unknown>[]> = {};
      for (const table of new Set(catalog.map((c) => c.table_name)))
        rows[table] = (await app.query("SELECT app.export_rows($1) AS row", [table])).rows.map((r) => r.row);
      const { files, manifest } = buildPackage({ catalog, rows, generatedAt: new Date(), generatedBy: "Priya Raman" });
      expect(manifest.map((m) => m.table)).toEqual([...new Set(catalog.map((c) => c.table_name))].sort());
      expect(files.map((f) => f.name)).toEqual(["README.txt", "manifest.csv", ...manifest.map((m) => m.file)]);
      const submissions = manifest.find((m) => m.table === "submission")!;
      expect(submissions.rows).toBe((await owner.query("SELECT count(*)::int AS n FROM submission")).rows[0].n);
      const readme = String(files[0].data);
      for (const entry of manifest) expect(readme).toContain(`${entry.table} (${entry.rows} rows)`);
    });
  });

  it("is limited to Finance administrators", async () => {
    await asUser(app, daniel, async () => {
      expect(await code(() => app.query("SELECT * FROM app.export_catalog()"))).toBe("42501");
      expect(await code(() => app.query("SELECT app.export_rows('organization')"))).toBe("42501");
    });
    await asUser(app, maria, async () => {
      expect(await code(() => app.query("SELECT * FROM app.export_catalog()"))).toBe("42501");
      expect(await code(() => app.query("SELECT app.export_rows('submission')"))).toBe("42501");
    });
    await asUser(app, null, async () => {
      expect(await code(() => app.query("SELECT app.export_rows('submission')"))).toBe("42501");
    });
  });
});
