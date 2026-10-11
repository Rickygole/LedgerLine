import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, ownerUrl, userId } from "./helpers";

let owner: Client;
let marisol: string;
let daniel: string;
let priya: string;
let inScope: string;
let outScope: string;
let outInitiative: string;
let dycdInitiative: string;
let dycdSubmissions: number;
let allSubmissions: number;

beforeAll(async () => {
  owner = await connect(ownerUrl());
  marisol = await userId(owner, "marisol.vandenberg");
  daniel = await userId(owner, "daniel.cho");
  priya = await userId(owner, "priya");
  const pick = async (agencyTest: string, status: string) =>
    (
      await owner.query(
        `SELECT s.id, a.initiative_id FROM submission s JOIN assignment a ON a.id = s.assignment_id
         JOIN initiative i ON i.id = a.initiative_id
         WHERE s.status = $1 AND ${agencyTest} ORDER BY s.reference_no LIMIT 1`,
        [status],
      )
    ).rows[0] as { id: string; initiative_id: string };
  const inside = await pick("i.administering_agency = 'DYCD'", "submitted");
  const outside = await pick("i.administering_agency IS DISTINCT FROM 'DYCD'", "submitted");
  inScope = inside.id;
  dycdInitiative = inside.initiative_id;
  outScope = outside.id;
  outInitiative = outside.initiative_id;
  dycdSubmissions = (
    await owner.query(
      `SELECT count(*)::int AS n FROM submission s JOIN assignment a ON a.id = s.assignment_id
       JOIN initiative i ON i.id = a.initiative_id WHERE i.administering_agency = 'DYCD'`,
    )
  ).rows[0].n;
  allSubmissions = (await owner.query("SELECT count(*)::int AS n FROM submission")).rows[0].n;
});

afterAll(async () => {
  await owner?.end();
});

async function as<T>(user: string, fn: () => Promise<T>, setup?: string[][]): Promise<T> {
  await owner.query("BEGIN");
  try {
    for (const [sql, ...params] of setup ?? []) await owner.query(sql, params);
    await owner.query("SET LOCAL ROLE app_server");
    await owner.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
    return await fn();
  } finally {
    await owner.query("ROLLBACK");
  }
}

function planted(): string[][] {
  return [inScope, outScope].flatMap((id) => [
    ["INSERT INTO flag (submission_id, kind, source, note) VALUES ($1::uuid, 'manual', 'user', 'planted')", id],
    [
      "INSERT INTO attachment (submission_id, path, filename, bytes, mime) VALUES ($1::uuid, 'planted/' || $1::text, 'planted.pdf', 10, 'application/pdf')",
      id,
    ],
  ]);
}

async function rows(sql: string, params: unknown[] = []): Promise<number> {
  return (await owner.query(sql, params)).rowCount ?? 0;
}

async function code(fn: () => Promise<unknown>): Promise<string | null> {
  await owner.query("SAVEPOINT attempt");
  try {
    await fn();
    return null;
  } catch (error) {
    await owner.query("ROLLBACK TO SAVEPOINT attempt");
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe("[US-060][BR-017] Finance access scope", () => {
  it("leaves an unscoped analyst and an administrator with every report", async () => {
    for (const user of [daniel, priya]) {
      const seen = await as(user, () => rows("SELECT id FROM submission"));
      expect(seen).toBe(allSubmissions);
    }
  });

  it("limits a DYCD analyst to DYCD reports and hides every other report and its records", async () => {
    await as(
      marisol,
      async () => {
        expect(await rows("SELECT id FROM submission")).toBe(dycdSubmissions);
        expect(await rows("SELECT id FROM submission WHERE id = $1", [inScope])).toBe(1);
        for (const table of ["submission_revision", "answer", "budget_line", "attachment", "flag"]) {
          expect(await rows(`SELECT 1 FROM ${table} WHERE submission_id = $1`, [outScope]), table).toBe(0);
        }
        expect(await rows("SELECT id FROM submission WHERE id = $1", [outScope])).toBe(0);
        expect(await rows("SELECT id FROM assignment WHERE initiative_id = $1", [outInitiative])).toBe(0);
        expect(await rows("SELECT id FROM assignment WHERE initiative_id = $1", [dycdInitiative])).toBeGreaterThan(0);
        expect(await rows("SELECT 1 FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [outScope])).toBe(
          0,
        );
        expect(await rows("SELECT 1 FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [inScope])).toBe(
          (await owner.query("SELECT 1 FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [inScope]))
            .rowCount,
        );
        expect(await rows("SELECT 1 FROM outbox WHERE submission_id = $1", [outScope])).toBe(0);
        expect(await rows("SELECT 1 FROM obligation WHERE initiative_id = $1", [outInitiative])).toBe(0);
        expect(await rows("SELECT 1 FROM flag WHERE submission_id = $1", [inScope])).toBe(1);
        expect(await rows("SELECT 1 FROM attachment WHERE submission_id = $1", [inScope])).toBe(1);
      },
      planted(),
    );
  });

  it("keeps in-scope reads working for the scoped analyst", async () => {
    await as(marisol, async () => {
      expect(await rows("SELECT 1 FROM answer WHERE submission_id = $1", [inScope])).toBe(
        (await owner.query("SELECT 1 FROM answer WHERE submission_id = $1", [inScope])).rowCount,
      );
      expect(await rows("SELECT 1 FROM obligation WHERE initiative_id = $1", [dycdInitiative])).toBeGreaterThan(0);
    });
  });

  it("refuses review actions outside the scope and allows them inside it", async () => {
    await as(marisol, async () => {
      const transition = (id: string, action: string, note: string | null) =>
        owner.query("SELECT * FROM app.transition_submission($1, $2, NULL, NULL, $3, NULL, NULL)", [id, action, note]);
      expect(await code(() => transition(outScope, "start_review", null))).toBe("42501");
      expect(await code(() => transition(outScope, "request_update", "please fix"))).toBe("42501");
      expect(await code(() => transition(outScope, "accept", null))).toBe("42501");
      expect(
        await code(() =>
          owner.query("SELECT app.correct_answer($1, 'x', '1'::jsonb, 'reason', '{}'::jsonb)", [outScope]),
        ),
      ).toBe("42501");
      expect(
        await code(() =>
          owner.query("SELECT app.correct_submission($1, '{}'::jsonb, NULL, 'reason', '{}'::jsonb, NULL, NULL)", [
            outScope,
          ]),
        ),
      ).toBe("42501");
      expect(
        await code(() =>
          owner.query(
            "INSERT INTO flag (submission_id, kind, source, note, created_by) VALUES ($1, 'manual', 'user', 'look', $2)",
            [outScope, marisol],
          ),
        ),
      ).toBe("42501");

      expect(await code(() => transition(inScope, "start_review", null))).toBeNull();
      expect(
        await code(() =>
          owner.query(
            "INSERT INTO flag (submission_id, kind, source, note, created_by) VALUES ($1, 'manual', 'user', 'look', $2)",
            [inScope, marisol],
          ),
        ),
      ).toBeNull();
      expect(
        await code(() =>
          owner.query("SELECT app.correct_answer($1, 'x', '1'::jsonb, 'reason', '{}'::jsonb)", [inScope]),
        ),
      ).toBeNull();
    });
  });

  it("does not let a scoped analyst update an out-of-scope report or resolve its flags", async () => {
    await as(marisol, async () => {
      const touched = await owner.query("UPDATE submission SET updated_at = now() WHERE id = $1", [outScope]);
      expect(touched.rowCount).toBe(0);
      const resolved = await owner.query("UPDATE flag SET status = 'resolved' WHERE submission_id = $1", [outScope]);
      expect(resolved.rowCount).toBe(0);
    });
  });

  it("scopes by initiative, and combines agencies with initiatives", async () => {
    const setup = [
      [
        "UPDATE app_user SET scope_agencies = '{}', scope_initiatives = ARRAY[$1::uuid] WHERE id = $2",
        outInitiative,
        marisol,
      ],
    ];
    await as(
      marisol,
      async () => {
        expect(await rows("SELECT id FROM submission WHERE id = $1", [outScope])).toBe(1);
        expect(await rows("SELECT id FROM submission WHERE id = $1", [inScope])).toBe(0);
        expect(
          await rows("SELECT id FROM submission s WHERE app.submission_initiative(s.id) <> $1", [outInitiative]),
        ).toBe(0);
      },
      setup,
    );
    await as(marisol, async () => {
      expect(await rows("SELECT id FROM submission WHERE id IN ($1, $2)", [outScope, inScope])).toBe(2);
    }, [
      [
        "UPDATE app_user SET scope_agencies = ARRAY['DYCD'], scope_initiatives = ARRAY[$1::uuid] WHERE id = $2",
        outInitiative,
        marisol,
      ],
    ]);
  });

  it("scopes a view-only analyst too, and an inactive scope holder sees nothing", async () => {
    const grace = await userId(owner, "grace");
    await as(grace, async () => {
      expect(await rows("SELECT id FROM submission")).toBe(dycdSubmissions);
      expect(await rows("SELECT id FROM submission WHERE id = $1", [outScope])).toBe(0);
    }, [["UPDATE app_user SET scope_agencies = ARRAY['DYCD'] WHERE id = $1", grace]]);
    await as(marisol, async () => {
      expect(await rows("SELECT id FROM submission")).toBe(0);
    }, [["UPDATE app_user SET active = false WHERE id = $1", marisol]]);
  });

  it("does not allow a scope on an administrator or an organization account", async () => {
    await owner.query("BEGIN");
    try {
      expect(
        await code(() => owner.query("UPDATE app_user SET scope_agencies = ARRAY['DYCD'] WHERE id = $1", [priya])),
      ).toBe("23514");
    } finally {
      await owner.query("ROLLBACK");
    }
  });

  it("lets only an administrator change a scope", async () => {
    await as(daniel, async () => {
      const result = await owner.query("UPDATE app_user SET scope_agencies = ARRAY['DYCD'] WHERE id = $1", [marisol]);
      expect(result.rowCount).toBe(0);
    });
    await as(priya, async () => {
      const result = await owner.query("UPDATE app_user SET scope_agencies = ARRAY['DFTA'] WHERE id = $1", [marisol]);
      expect(result.rowCount).toBe(1);
    });
  });
});
