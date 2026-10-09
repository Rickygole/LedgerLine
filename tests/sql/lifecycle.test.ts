import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, asUser, connect, errorCode, ownerUrl, userId } from "./helpers";

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

async function pickInitiatives(count: number, minOrgs = 1): Promise<{ id: string; name: string; orgs: number }[]> {
  const { rows } = await owner.query(
    `SELECT i.id, i.name, count(a.id)::int AS orgs
     FROM initiative i JOIN assignment a ON a.initiative_id = i.id
     JOIN form_version fv ON fv.initiative_id = i.id AND fv.status = 'published'
     WHERE i.fiscal_year_id = 'FY27' AND i.status = 'active'
     GROUP BY i.id HAVING count(a.id) >= $2 ORDER BY i.code LIMIT $1`,
    [count, minOrgs]
  );
  return rows;
}

function plan(entries: object[]): string {
  return JSON.stringify(entries);
}

describe("[US-009][BR-015] rollover copies forms and assignments", () => {
  it("creates the new year, its reporting periods and carried initiatives", async () => {
    const [first] = await pickInitiatives(1);
    const result = await asUser(app, priya, async () => {
      const summary = (await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb) AS s", [plan([{ initiative_id: first.id, action: "carry" }])])).rows[0].s;
      const year = (await app.query("SELECT starts_on::text, ends_on::text FROM fiscal_year WHERE id = 'FY28'")).rows[0];
      const periods = (await app.query("SELECT id, due_on::text FROM reporting_period WHERE fiscal_year_id = 'FY28' ORDER BY id")).rows;
      const successor = (await app.query(
        `SELECT i.id, i.code, i.name, i.fiscal_year_id FROM initiative i JOIN initiative_lineage l ON l.successor_id = i.id WHERE l.predecessor_id = $1`,
        [first.id]
      )).rows[0];
      const copiedAssignments = (await app.query("SELECT count(*)::int AS n FROM assignment WHERE initiative_id = $1", [successor.id])).rows[0].n;
      const sameAwards = (await app.query(
        `SELECT count(*)::int AS n FROM assignment n JOIN assignment o ON o.org_id = n.org_id AND o.initiative_id = $1 AND o.award_amount = n.award_amount WHERE n.initiative_id = $2`,
        [first.id, successor.id]
      )).rows[0].n;
      const forms = (await app.query("SELECT version, status FROM form_version WHERE initiative_id = $1", [successor.id])).rows;
      const sameForm = (await app.query(
        `SELECT count(*)::int AS n FROM form_version o JOIN form_version n ON n.definition = o.definition WHERE o.initiative_id = $1 AND o.status = 'published' AND n.initiative_id = $2`,
        [first.id, successor.id]
      )).rows[0].n;
      return { summary, year, periods, successor, copiedAssignments, sameAwards, forms, sameForm };
    });
    expect(result.year).toEqual({ starts_on: "2027-07-01", ends_on: "2028-06-30" });
    expect(result.periods).toEqual([
      { id: "FY28-MY", due_on: "2028-01-31" },
      { id: "FY28-YE", due_on: "2028-09-30" },
    ]);
    expect(result.successor.fiscal_year_id).toBe("FY28");
    expect(result.successor.code).toMatch(/^CI-28-\d{3}$/);
    expect(result.successor.name).toBe(first.name);
    expect(result.copiedAssignments).toBe(first.orgs);
    expect(result.sameAwards).toBe(first.orgs);
    expect(result.forms).toEqual([{ version: 1, status: "published" }]);
    expect(result.sameForm).toBe(1);
    expect(result.summary.periods_created).toBe(2);
  });

  it("carries every active initiative that the plan does not mention", async () => {
    const total = (await owner.query("SELECT count(*)::int AS n FROM initiative WHERE fiscal_year_id = 'FY27' AND status = 'active'")).rows[0].n;
    const summary = await asUser(app, priya, async () => (await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', '[]'::jsonb) AS s")).rows[0].s);
    expect(summary.initiatives_created).toBe(total);
    expect(summary.carried).toBe(total);
  });

  it("renames, retires and does not run twice for the same initiative", async () => {
    const [a, b] = await pickInitiatives(2);
    const result = await asUser(app, priya, async () => {
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb)", [
        plan([
          { initiative_id: a.id, action: "rename", new_name: "Youth Pathways Renamed" },
          { initiative_id: b.id, action: "retire" },
        ]),
      ]);
      const renamed = (await app.query("SELECT i.name FROM initiative i JOIN initiative_lineage l ON l.successor_id = i.id WHERE l.predecessor_id = $1 AND l.kind = 'renamed'", [a.id])).rows;
      const retired = (await app.query("SELECT i.status, (SELECT count(*)::int FROM initiative_lineage l WHERE l.predecessor_id = i.id AND l.kind = 'retired' AND l.successor_id IS NULL) AS lineage FROM initiative i WHERE i.id = $1", [b.id])).rows[0];
      const again = (await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', '[]'::jsonb) AS s")).rows[0].s;
      return { renamed, retired, again };
    });
    expect(result.renamed).toEqual([{ name: "Youth Pathways Renamed" }]);
    expect(result.retired).toEqual({ status: "retired", lineage: 1 });
    expect(result.again.initiatives_created).toBe(0);
    expect(result.again.skipped).toBeGreaterThan(0);
  });

  it("is limited to finance administrators and leaves nothing behind when it fails", async () => {
    const denied = await asUser(app, daniel, () => errorCode(() => app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', '[]'::jsonb)")));
    expect(denied).toBe("42501");
    const cbo = await asUser(app, maria, () => errorCode(() => app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', '[]'::jsonb)")));
    expect(cbo).toBe("42501");
    const backwards = await asUser(app, priya, () => errorCode(() => app.query("SELECT app.rollover_fiscal_year('FY27', 'FY26', '[]'::jsonb)")));
    expect(backwards).toBe("23514");
    const left = (await owner.query("SELECT count(*)::int AS n FROM fiscal_year WHERE id = 'FY28'")).rows[0].n;
    expect(left).toBe(0);
  });
});

describe("[US-011] combine merges assignments and records lineage", () => {
  it("sums awards per organization and takes the form from the first predecessor", async () => {
    const picks = await pickInitiatives(2);
    const [a, b] = picks;
    const expected = (
      await owner.query(
        `SELECT count(DISTINCT org_id)::int AS orgs, sum(award_amount)::float8 AS total FROM assignment WHERE initiative_id = ANY($1::uuid[])`,
        [[a.id, b.id]]
      )
    ).rows[0];
    const result = await asUser(app, priya, async () => {
      const summary = (await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb) AS s", [
        plan([
          { initiative_id: a.id, action: "combine", group: "g1", new_name: "Combined Youth Program" },
          { initiative_id: b.id, action: "combine", group: "g1" },
        ]),
      ])).rows[0].s;
      const merged = (await app.query(
        `SELECT i.id, i.name, i.total_funding::float8 AS funding FROM initiative i JOIN initiative_lineage l ON l.successor_id = i.id WHERE l.predecessor_id = $1`,
        [a.id]
      )).rows[0];
      const orgs = (await app.query("SELECT count(*)::int AS n, sum(award_amount)::float8 AS total FROM assignment WHERE initiative_id = $1", [merged.id])).rows[0];
      const lineage = (await app.query("SELECT predecessor_id, kind FROM initiative_lineage WHERE successor_id = $1 ORDER BY created_at, predecessor_id", [merged.id])).rows;
      const formMatches = (await app.query(
        `SELECT count(*)::int AS n FROM form_version n JOIN form_version o ON o.definition = n.definition AND o.initiative_id = $1 AND o.status = 'published' WHERE n.initiative_id = $2`,
        [a.id, merged.id]
      )).rows[0].n;
      return { summary, merged, orgs, lineage, formMatches };
    });
    expect(result.merged.name).toBe("Combined Youth Program");
    expect(result.orgs.n).toBe(expected.orgs);
    expect(result.orgs.total).toBeCloseTo(expected.total, 2);
    expect(result.lineage.map((l: { predecessor_id: string }) => l.predecessor_id).sort()).toEqual([a.id, b.id].sort());
    expect(result.lineage.every((l: { kind: string }) => l.kind === "combined")).toBe(true);
    expect(result.formMatches).toBe(1);
    expect(result.summary.combined).toBe(1);
    expect(result.summary.combined_predecessors).toBe(2);
  });

  it("rejects a group with a single initiative", async () => {
    const [a] = await pickInitiatives(1);
    const code = await asUser(app, priya, () =>
      errorCode(() => app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb)", [plan([{ initiative_id: a.id, action: "combine", group: "solo" }])]))
    );
    expect(code).toBe("23514");
  });
});

describe("[US-012][BR-016] lineage links predecessors", () => {
  it("lets finance read lineage and keeps writes with the rollover function", async () => {
    const [a] = await pickInitiatives(1);
    const result = await asUser(app, priya, async () => {
      await app.query("SELECT app.rollover_fiscal_year('FY27', 'FY28', $1::jsonb)", [plan([{ initiative_id: a.id, action: "carry" }])]);
      const chain = (await app.query(
        `SELECT p.name AS from_name, s.name AS to_name, l.kind FROM initiative_lineage l JOIN initiative p ON p.id = l.predecessor_id JOIN initiative s ON s.id = l.successor_id WHERE l.predecessor_id = $1`,
        [a.id]
      )).rows;
      const audit = (await app.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'rollover'")).rows[0].n;
      await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: daniel })]);
      const seenByAnalyst = (await app.query("SELECT count(*)::int AS n FROM initiative_lineage")).rows[0].n;
      await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: maria })]);
      const seenByOrg = (await app.query("SELECT count(*)::int AS n FROM initiative_lineage")).rows[0].n;
      return { chain, audit, seenByAnalyst, seenByOrg };
    });
    expect(result.chain).toHaveLength(1);
    expect(result.chain[0].kind).toBe("carried");
    expect(result.chain[0].from_name).toBe(result.chain[0].to_name);
    expect(result.audit).toBe(1);
    expect(result.seenByAnalyst).toBeGreaterThan(0);
    expect(result.seenByOrg).toBe(0);
    const direct = await asUser(app, daniel, () =>
      errorCode(() => app.query("INSERT INTO initiative_lineage (predecessor_id, successor_id, kind, fiscal_year_id) VALUES ($1, $1, 'carried', 'FY27')", [a.id]))
    );
    expect(direct).not.toBeNull();
  });
});

describe("[US-052] reminders queue once per org per rule per day and skip submitted reports", () => {
  const today = "2026-10-01";

  async function owingOrgs(): Promise<string[]> {
    const { rows } = await owner.query(
      `SELECT DISTINCT a.org_id FROM assignment a
       JOIN initiative i ON i.id = a.initiative_id AND i.status = 'active'
       LEFT JOIN submission s ON s.assignment_id = a.id AND s.period_id = 'FY26-YE'
       WHERE (s.id IS NULL OR s.status IN ('draft', 'returned'))
         AND EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published')
         AND EXISTS (SELECT 1 FROM contact c WHERE c.org_id = a.org_id)`
    );
    return rows.map((r) => r.org_id).sort();
  }

  it("emails each owing organization once and a second run adds nothing", async () => {
    const expected = await owingOrgs();
    const result = await asUser(app, priya, async () => {
      const first = (await app.query("SELECT app.queue_reminders('FY26-YE', $1::date) AS n", [today])).rows[0].n;
      const second = (await app.query("SELECT app.queue_reminders('FY26-YE', $1::date) AS n", [today])).rows[0].n;
      const rows = (await app.query("SELECT org_id, to_email, subject, body_text FROM outbox WHERE template = 'reminder' ORDER BY org_id")).rows;
      const audit = (await app.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'reminders_queued'")).rows[0].n;
      return { first, second, rows, audit };
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(result.first).toBe(expected.length);
    expect(result.second).toBe(0);
    expect(result.rows.map((r: { org_id: string }) => r.org_id).sort()).toEqual(expected);
    expect(result.rows[0].subject).toContain("Past due");
    expect(result.rows[0].body_text).not.toContain("{");
    expect(result.audit).toBe(2);
  });

  it("skips organizations whose reports are all submitted", async () => {
    const owing = new Set(await owingOrgs());
    const { rows } = await owner.query("SELECT id FROM organization");
    const done = rows.map((r) => r.id).filter((id) => !owing.has(id));
    const queued = await asUser(app, priya, async () => {
      await app.query("SELECT app.queue_reminders('FY26-YE', $1::date)", [today]);
      return (await app.query("SELECT DISTINCT org_id FROM outbox WHERE template = 'reminder'")).rows.map((r) => r.org_id);
    });
    expect(done.length).toBeGreaterThan(0);
    for (const id of done) expect(queued).not.toContain(id);
  });

  it("sends nothing on a day that matches no rule", async () => {
    const n = await asUser(app, priya, async () => (await app.query("SELECT app.queue_reminders('FY26-YE', '2026-10-05'::date) AS n")).rows[0].n);
    expect(n).toBe(0);
  });

  it("is limited to finance administrators and previews for all finance staff", async () => {
    const denied = await asUser(app, daniel, () => errorCode(() => app.query("SELECT app.queue_reminders('FY26-YE', $1::date)", [today])));
    expect(denied).toBe("42501");
    const preview = await asUser(app, daniel, async () => (await app.query("SELECT count(*)::int AS n FROM app.reminder_targets('FY26-YE', $1::date)", [today])).rows[0].n);
    expect(preview).toBeGreaterThan(0);
    const org = await asUser(app, maria, () => errorCode(() => app.query("SELECT * FROM app.reminder_targets('FY26-YE', $1::date)", [today])));
    expect(org).toBe("42501");
    const write = await asUser(app, daniel, () => errorCode(() => app.query("UPDATE reminder_rule SET active = false")));
    expect(write).toBeNull();
    const changed = await asUser(app, daniel, async () => (await app.query("UPDATE reminder_rule SET active = false")).rowCount);
    expect(changed).toBe(0);
  });

  it("uses a scheduler identity that cannot sign in", async () => {
    const { rows } = await owner.query("SELECT role, can_sign_in, password_hash FROM app_user WHERE email = 'system.scheduler@ledgerline.example'");
    expect(rows[0]).toEqual({ role: "finance_admin", can_sign_in: false, password_hash: null });
  });
});
