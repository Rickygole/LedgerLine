import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDefinition, STANDARD_QUESTIONS } from "@/lib/forms/standard";
import type { FormDefinition } from "@/lib/rules/types";
import { appUrl, connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let priya: string;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  priya = await userId(owner, "priya.raman");
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function claims(id: string) {
  await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id })]);
}

async function attempt(fn: () => Promise<unknown>): Promise<string | null> {
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

async function inTx<T>(fn: () => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    return await fn();
  } finally {
    await app.query("ROLLBACK");
  }
}

describe("[US-003] standard questions come from one shared library", () => {
  const standardOf = (definition: FormDefinition) => definition.sections.flatMap((s) => s.questions).filter((q) => q.scope === "standard");

  it("embeds the same library questions in every form version on file, across both fiscal years", async () => {
    const { rows } = await owner.query<{ definition: FormDefinition; fiscal_year_id: string }>(
      "SELECT fv.definition, i.fiscal_year_id FROM form_version fv JOIN initiative i ON i.id = fv.initiative_id"
    );
    expect(rows.length).toBeGreaterThan(300);
    expect(new Set(rows.map((r) => r.fiscal_year_id))).toEqual(new Set(["FY26", "FY27"]));
    const library = STANDARD_QUESTIONS.map((q) => q.key).sort();
    for (const row of rows) {
      const standard = standardOf(row.definition);
      expect(standard.map((q) => q.key).sort()).toEqual(library);
      for (const question of standard) expect(question).toEqual(STANDARD_QUESTIONS.find((q) => q.key === question.key));
    }
  });

  it("applies one change to the library to every form built afterwards without editing any form", () => {
    const original = STANDARD_QUESTIONS.find((q) => q.key === "contact_name")!;
    const before = original.label;
    original.label = "Name of the person completing this report";
    try {
      const forms = ["Tutoring", "Meals", "Legal help"].map((name) => buildDefinition(`${name} report`, []));
      for (const form of forms) expect(standardOf(form).find((q) => q.key === "contact_name")?.label).toBe("Name of the person completing this report");
    } finally {
      original.label = before;
    }
    expect(standardOf(buildDefinition("After", [])).find((q) => q.key === "contact_name")?.label).toBe(before);
  });

  it("keeps initiative questions out of the library", async () => {
    const own = { key: "only_here", label: "Only on one form", type: "integer", required: false, scope: "initiative" } as const;
    const a = buildDefinition("A", [own]);
    const b = buildDefinition("B", []);
    expect(standardOf(a).map((q) => q.key)).toEqual(standardOf(b).map((q) => q.key));
    expect(standardOf(a).some((q) => q.key === "only_here")).toBe(false);
  });
});

describe("[BR-001] about 175 initiatives each fiscal year, and the set changes between years", () => {
  it("holds about 175 initiatives in each year on file", async () => {
    const { rows } = await owner.query<{ fiscal_year_id: string; n: number }>("SELECT fiscal_year_id, count(*)::int AS n FROM initiative GROUP BY 1 ORDER BY 1");
    expect(rows.map((r) => r.fiscal_year_id)).toEqual(["FY26", "FY27"]);
    for (const row of rows) {
      expect(row.n).toBeGreaterThanOrEqual(165);
      expect(row.n).toBeLessThanOrEqual(185);
    }
  });

  it("differs between FY26 and FY27 in both directions", async () => {
    const { rows } = await owner.query<{ only26: number; only27: number }>(
      `SELECT (SELECT count(*)::int FROM initiative a WHERE a.fiscal_year_id = 'FY26' AND NOT EXISTS (SELECT 1 FROM initiative b WHERE b.fiscal_year_id = 'FY27' AND b.name = a.name)) AS only26,
              (SELECT count(*)::int FROM initiative a WHERE a.fiscal_year_id = 'FY27' AND NOT EXISTS (SELECT 1 FROM initiative b WHERE b.fiscal_year_id = 'FY26' AND b.name = a.name)) AS only27`
    );
    expect(rows[0].only26).toBeGreaterThan(0);
    expect(rows[0].only27).toBeGreaterThan(0);
  });

  it("lets the portfolio shrink or grow at rollover without changing code", async () => {
    await inTx(async () => {
      await claims(priya);
      const before = (await app.query("SELECT count(*)::int AS n FROM initiative WHERE fiscal_year_id = 'FY27' AND status = 'active'")).rows[0].n;
      const picks = (await app.query("SELECT id FROM initiative WHERE fiscal_year_id = 'FY27' AND status = 'active' ORDER BY code LIMIT 3")).rows.map((r) => ({ initiative_id: r.id, action: "retire" }));
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb)", [JSON.stringify(picks)]);
      await app.query(
        `INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding)
         VALUES ('CI-28-901', 'Neighborhood Tool Library', 'Parks and Environment', 'Shared tools for block associations.', 'FY28', 0)`
      );
      const next = (await app.query("SELECT count(*)::int AS n FROM initiative WHERE fiscal_year_id = 'FY28' AND status = 'active'")).rows[0].n;
      expect(next).toBe(before - picks.length + 1);
      expect(next).not.toBe(before);
    });
  });
});

describe("[US-060][BR-017] 50 to 100 Finance users with different permissions", () => {
  it("holds 100 Finance users across the three roles and enforces each role's permissions", async () => {
    await inTx(async () => {
      await claims(priya);
      const existing = (await app.query("SELECT count(*)::int AS n FROM app_user WHERE role <> 'cbo_submitter'")).rows[0].n;
      const need = 100 - existing;
      expect(need).toBeGreaterThan(0);
      await app.query(
        `SELECT app.create_user('finance.user' || g || '@finance.example.gov', 'Finance User ' || g, 'Staff', (ARRAY['finance_viewer', 'finance_analyst', 'finance_admin'])[1 + g % 3], NULL, 'https://ledgerline.example.gov')
         FROM generate_series(1, $1::int) g`,
        [need]
      );
      const byRole = (await app.query("SELECT role, count(*)::int AS n FROM app_user WHERE role <> 'cbo_submitter' GROUP BY 1 ORDER BY 1")).rows;
      expect(byRole.reduce((sum, r) => sum + r.n, 0)).toBe(100);
      expect(byRole).toHaveLength(3);
      for (const row of byRole) expect(row.n).toBeGreaterThan(20);

      const pick = async (role: string) => (await app.query("SELECT id FROM app_user WHERE email LIKE 'finance.user%' AND role = $1 ORDER BY email LIMIT 1", [role])).rows[0].id as string;
      const [viewer, analyst, admin] = [await pick("finance_viewer"), await pick("finance_analyst"), await pick("finance_admin")];
      const submission = (await owner.query("SELECT id FROM submission LIMIT 1")).rows[0].id;
      const flag = (who: string) => app.query("INSERT INTO flag (submission_id, kind, source, note, created_by) VALUES ($1, 'manual', 'user', 'check', $2)", [submission, who]);
      const initiative = () =>
        app.query("INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding) VALUES ('CI-T-100', 'Capacity check', 'Education', 'Capacity check.', 'FY27', 0)");
      const createUser = () => app.query("SELECT app.create_user('extra.person@finance.example.gov', 'Extra Person', NULL, 'finance_viewer', NULL, 'https://ledgerline.example.gov')");

      await claims(viewer);
      expect((await app.query("SELECT count(*)::int AS n FROM submission")).rows[0].n).toBeGreaterThan(0);
      expect(await attempt(() => flag(viewer))).toBe("42501");
      expect(await attempt(initiative)).toBe("42501");
      expect(await attempt(createUser)).toBe("42501");

      await claims(analyst);
      expect(await attempt(() => flag(analyst))).toBeNull();
      expect(await attempt(initiative)).toBe("42501");
      expect(await attempt(createUser)).toBe("42501");

      await claims(admin);
      expect(await attempt(initiative)).toBeNull();
      expect(await attempt(createUser)).toBeNull();
    });
  });

  it("keeps user management working at 100 users: an administrator sees every account and can change a role", async () => {
    await inTx(async () => {
      await claims(priya);
      await app.query(
        `SELECT app.create_user('finance.user' || g || '@finance.example.gov', 'Finance User ' || g, 'Staff', 'finance_viewer', NULL, 'https://ledgerline.example.gov')
         FROM generate_series(1, 90) g`
      );
      const visible = (await app.query("SELECT count(*)::int AS n FROM app_user WHERE role <> 'cbo_submitter'")).rows[0].n;
      const total = (await owner.query("SELECT count(*)::int AS n FROM app_user WHERE role <> 'cbo_submitter'")).rows[0].n;
      expect(visible).toBeGreaterThanOrEqual(90);
      expect(visible).toBeGreaterThanOrEqual(total);
      await app.query("UPDATE app_user SET role = 'finance_analyst' WHERE email = 'finance.user7@finance.example.gov'");
      expect((await app.query("SELECT role FROM app_user WHERE email = 'finance.user7@finance.example.gov'")).rows[0].role).toBe("finance_analyst");
    });
  });
});

describe("[US-059][BR-018] no cap on submitting users", () => {
  it("creates 5,000 submitter accounts in one transaction, each scoped to its own organization", async () => {
    await app.query("BEGIN");
    try {
      await claims(priya);
      const before = (await app.query("SELECT count(*)::int AS n FROM app_user WHERE role = 'cbo_submitter'")).rows[0].n;
      await app.query(
        `SELECT app.create_user('submitter' || g || '@load.example.org', 'Load Submitter ' || g, 'Staff', 'cbo_submitter', orgs[1 + g % cardinality(orgs)], 'https://ledgerline.example.gov')
         FROM generate_series(1, 5000) g, (SELECT array_agg(id) AS orgs FROM organization) o`
      );
      const after = (await app.query("SELECT count(*)::int AS n FROM app_user WHERE role = 'cbo_submitter'")).rows[0].n;
      expect(after - before).toBe(5000);

      const sample = (await app.query("SELECT id, org_id FROM app_user WHERE email = 'submitter4999@load.example.org'")).rows[0];
      await claims(sample.id);
      const own = (await app.query("SELECT count(*)::int AS n FROM assignment WHERE org_id = $1", [sample.org_id])).rows[0].n;
      const visible = (await app.query("SELECT count(*)::int AS n FROM assignment")).rows[0].n;
      expect(own).toBeGreaterThan(0);
      expect(visible).toBe(own);
      expect(await attempt(() => app.query("SELECT app.create_user('x@load.example.org', 'X', NULL, 'cbo_submitter', $1, 'https://ledgerline.example.gov')", [sample.org_id]))).toBe("42501");
    } finally {
      await app.query("ROLLBACK");
    }
    const left = (await owner.query("SELECT count(*)::int AS n FROM app_user WHERE email LIKE '%@load.example.org'")).rows[0].n;
    expect(left).toBe(0);
  }, 180_000);

  it("has no constraint or trigger that limits how many accounts exist", async () => {
    const constraints = (await owner.query("SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'app_user'::regclass")).rows.map((r) => r.def as string);
    for (const def of constraints) expect(def).not.toMatch(/count\(|limit/i);
    const triggers = (await owner.query("SELECT tgname FROM pg_trigger WHERE tgrelid = 'app_user'::regclass AND NOT tgisinternal")).rows;
    expect(triggers).toEqual([]);
  });
});
