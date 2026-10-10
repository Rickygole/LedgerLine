import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appUrl, connect, errorCode, ownerUrl, userId } from "./helpers";

let owner: Client;
let app: Client;
let maria: string;
let james: string;
let tomas: string;
let daniel: string;
let grace: string;
let priya: string;
let target: { assignment: string; form: string; award: string };

beforeAll(async () => {
  owner = await connect(ownerUrl());
  app = await connect(appUrl());
  maria = await userId(owner, "maria.santos");
  james = await userId(owner, "james.okafor");
  tomas = await userId(owner, "tomas.rivera");
  daniel = await userId(owner, "daniel.cho");
  grace = await userId(owner, "grace.chen");
  priya = await userId(owner, "priya.raman");
  const orgId = (await owner.query("SELECT org_id FROM app_user WHERE id = $1", [maria])).rows[0].org_id;
  target = (
    await owner.query(
      `SELECT a.id AS assignment, f.id AS form, a.award_amount::text AS award FROM assignment a JOIN initiative i ON i.id = a.initiative_id AND i.fiscal_year_id = 'FY27' JOIN form_version f ON f.initiative_id = a.initiative_id AND f.status = 'published'
       WHERE a.org_id = $1 AND NOT EXISTS (SELECT 1 FROM submission s WHERE s.assignment_id = a.id AND s.period_id = 'FY27-MY') LIMIT 1`,
      [orgId],
    )
  ).rows[0];
  SNAPSHOT = snapshotWith(target.award);
});

afterAll(async () => {
  await app?.end();
  await owner?.end();
});

async function as(user: string) {
  await app.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user })]);
}

async function inTransaction<T>(fn: () => Promise<T>): Promise<T> {
  await app.query("BEGIN");
  try {
    return await fn();
  } finally {
    await app.query("ROLLBACK");
  }
}

async function startDraft(user: string): Promise<string> {
  await as(user);
  const id = (await app.query("SELECT gen_random_uuid() AS id")).rows[0].id as string;
  await app.query(
    `INSERT INTO submission (id, reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
     VALUES ($1, $2, $3, 'FY27-MY', $4, 'draft', app.uid(), app.uid())`,
    [id, `LL-TEST-${id.slice(0, 8)}`, target.assignment, target.form],
  );
  await addBudget(id, target.award);
  return id;
}

async function addBudget(id: string, amount: string) {
  await app.query(
    "INSERT INTO budget_line (submission_id, row_id, position, category, description, amount) VALUES ($1, gen_random_uuid(), 1, 'PS', 'Staff', $2)",
    [id, amount],
  );
}

function snapshotWith(amount: string) {
  return JSON.stringify({
    formVersionId: "f",
    answers: { contact_name: "Maria Santos" },
    budget: [{ position: 1, category: "PS", description: "Staff", amount: Number(amount) }],
    attachments: [],
  });
}

let SNAPSHOT = "";

async function transition(
  user: string,
  id: string,
  action: string,
  note: string | null = null,
  outbox: object | null = null,
) {
  await as(daniel);
  const lock = (await app.query("SELECT lock_version FROM submission WHERE id = $1", [id])).rows[0].lock_version;
  await as(user);
  const result = await app.query(
    "SELECT * FROM app.transition_submission($1, $2, $3, $4::jsonb, $5, $6::jsonb, NULL)",
    [id, action, lock, action === "submit" ? SNAPSHOT : null, note, outbox ? JSON.stringify(outbox) : null],
  );
  return result.rows[0] as { status: string; revision: number; lock_version: number };
}

describe("[US-019] a submitter submits a completed report", () => {
  it("moves a draft to submitted, stores the snapshot with its hash and writes the audit event", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      const result = await transition(maria, id, "submit");
      expect(result).toMatchObject({ status: "submitted", revision: 1 });
      const revision = (
        await app.query("SELECT kind, snapshot, sha256 FROM submission_revision WHERE submission_id = $1", [id])
      ).rows[0];
      expect(revision.kind).toBe("submit");
      expect(revision.snapshot.answers.contact_name).toBe("Maria Santos");
      expect(revision.sha256).toMatch(/^[0-9a-f]{64}$/);
      await as(daniel);
      const audit = (
        await app.query("SELECT action, actor_id FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [id])
      ).rows;
      expect(audit).toEqual([{ action: "submit", actor_id: maria }]);
    });
  });

  it("refuses a second submit of the same report", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");
      await app.query("SAVEPOINT again");
      const code = await errorCode(() => transition(maria, id, "submit"));
      expect(code).toBe("23514");
    });
  });
});

describe("[BR-022] the database refuses a submit that does not balance", () => {
  it("refuses a direct submit whose saved budget is short of the award", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await app.query("UPDATE budget_line SET amount = amount - 1 WHERE submission_id = $1", [id]);
      await app.query("SAVEPOINT short");
      const code = await errorCode(() =>
        app.query("SELECT * FROM app.transition_submission($1, 'submit', 0, $2::jsonb, NULL, NULL, NULL)", [
          id,
          snapshotWith(String(Number(target.award) - 1)),
        ]),
      );
      expect(code).toBe("23514");
      await app.query("ROLLBACK TO SAVEPOINT short");
      expect((await app.query("SELECT status FROM submission WHERE id = $1", [id])).rows[0].status).toBe("draft");
    });
  });

  it("refuses a snapshot whose budget total differs from the saved budget lines", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      const code = await errorCode(() =>
        app.query("SELECT * FROM app.transition_submission($1, 'submit', 0, $2::jsonb, NULL, NULL, NULL)", [
          id,
          snapshotWith(String(Number(target.award) + 500)),
        ]),
      );
      expect(code).toBe("23514");
    });
  });

  it("refuses a submit that carries no lock version", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      const code = await errorCode(() =>
        app.query("SELECT * FROM app.transition_submission($1, 'submit', NULL, $2::jsonb, NULL, NULL, NULL)", [
          id,
          SNAPSHOT,
        ]),
      );
      expect(code).toBe("40001");
    });
  });

  it("refuses a resubmit with an unbalanced budget", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");
      await transition(daniel, id, "request_update", "Fix it");
      await as(maria);
      await app.query("UPDATE budget_line SET amount = amount + 10 WHERE submission_id = $1", [id]);
      const code = await errorCode(() =>
        app.query("SELECT * FROM app.transition_submission($1, 'submit', 2, $2::jsonb, NULL, NULL, NULL)", [
          id,
          snapshotWith(String(Number(target.award) + 10)),
        ]),
      );
      expect(code).toBe("23514");
    });
  });
});

describe("[US-020][BR-014] submitting queues an email with the submitted content", () => {
  it("writes the outbox message in the same step as the status change", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit", null, {
        to: "maria.santos@motthavenyouth.example.org",
        template: "submission_confirmation",
        subject: "Report received",
        body: "Contact name: Maria Santos\nTotal budget: $85,000.00",
      });
      await as(daniel);
      const mail = (
        await app.query("SELECT to_email, template, body_text, submission_id FROM outbox WHERE submission_id = $1", [
          id,
        ])
      ).rows;
      expect(mail).toHaveLength(1);
      expect(mail[0].to_email).toBe("maria.santos@motthavenyouth.example.org");
      expect(mail[0].body_text).toContain("Total budget: $85,000.00");
    });
  });

  it("queues nothing when the submit is refused", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await app.query("SAVEPOINT s");
      const code = await errorCode(() =>
        transition(tomas, id, "submit", null, { to: "x@example.org", template: "t", subject: "s", body: "b" }),
      );
      expect(code).toBe("42501");
      await app.query("ROLLBACK TO SAVEPOINT s");
      await as(daniel);
      const count = (await app.query("SELECT count(*)::int AS n FROM outbox WHERE submission_id = $1", [id])).rows[0].n;
      expect(count).toBe(0);
    });
  });
});

describe("[BR-007] several people at one organization may submit", () => {
  it("lets a colleague submit a report that Maria started and records who did it", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      const result = await transition(james, id, "submit");
      expect(result.status).toBe("submitted");
      const row = (await app.query("SELECT submitted_by FROM submission WHERE id = $1", [id])).rows[0];
      expect(row.submitted_by).toBe(james);
    });
  });
});

describe("[US-044] finance requests an update and the organization resubmits", () => {
  it("requires a note, returns the report, takes a second revision and then accepts", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");

      await app.query("SAVEPOINT noteless");
      expect(await errorCode(() => transition(daniel, id, "request_update", "   "))).toBe("23514");
      await app.query("ROLLBACK TO SAVEPOINT noteless");

      const returned = await transition(daniel, id, "request_update", "Explain the variance");
      expect(returned.status).toBe("returned");

      const resubmitted = await transition(maria, id, "submit");
      expect(resubmitted).toMatchObject({ status: "submitted", revision: 2 });

      const accepted = await transition(daniel, id, "accept");
      expect(accepted.status).toBe("accepted");

      await as(daniel);
      const actions = (
        await app.query("SELECT action FROM audit_event WHERE entity = 'submission' AND entity_id = $1 ORDER BY id", [
          id,
        ])
      ).rows.map((r) => r.action);
      expect(actions).toEqual(["submit", "request_update", "submit", "accept"]);
    });
  });

  it("keeps both submitted revisions after a resubmission", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");
      await transition(daniel, id, "request_update", "Fix the contact name");
      await transition(maria, id, "submit");
      await as(daniel);
      const revisions = (
        await app.query("SELECT revision, kind FROM submission_revision WHERE submission_id = $1 ORDER BY revision", [
          id,
        ])
      ).rows;
      expect(revisions).toEqual([
        { revision: 1, kind: "submit" },
        { revision: 2, kind: "submit" },
      ]);
    });
  });

  it("does not let a view-only user or an organization user ask for an update", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");
      await app.query("SAVEPOINT a");
      expect(await errorCode(() => transition(grace, id, "request_update", "Note"))).toBe("42501");
      await app.query("ROLLBACK TO SAVEPOINT a");
      expect(await errorCode(() => transition(maria, id, "request_update", "Note"))).toBe("42501");
    });
  });

  it("refuses to accept a report that was never submitted", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      expect(await errorCode(() => transition(daniel, id, "accept"))).toBe("23514");
    });
  });

  it("refuses a change made from a stale copy of the report", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");
      await as(daniel);
      const code = await errorCode(() =>
        app.query("SELECT * FROM app.transition_submission($1, 'accept', 0, NULL, NULL, NULL, NULL)", [id]),
      );
      expect(code).toBe("40001");
    });
  });
});

describe("[US-045] authorized staff correct submitted data with an audit record", () => {
  it("needs a reason, adds a correction revision and records the old and new value", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await app.query(
        "INSERT INTO answer (submission_id, question_key, value, updated_by) VALUES ($1, 'contact_title', '\"Director\"', app.uid())",
        [id],
      );
      await transition(maria, id, "submit");
      await as(daniel);

      await app.query("SAVEPOINT noreason");
      expect(
        await errorCode(() =>
          app.query("SELECT app.correct_answer($1, 'contact_title', '\"Executive Director\"', '', $2::jsonb)", [
            id,
            SNAPSHOT,
          ]),
        ),
      ).toBe("23514");
      await app.query("ROLLBACK TO SAVEPOINT noreason");

      const revision = (
        await app.query(
          "SELECT app.correct_answer($1, 'contact_title', '\"Executive Director\"', 'Confirmed by phone', $2::jsonb) AS rev",
          [id, SNAPSHOT],
        )
      ).rows[0].rev;
      expect(revision).toBe(2);
      const value = (
        await app.query("SELECT value FROM answer WHERE submission_id = $1 AND question_key = 'contact_title'", [id])
      ).rows[0].value;
      expect(value).toBe("Executive Director");
      const audit = (
        await app.query(
          "SELECT note, before, after FROM audit_event WHERE entity = 'submission' AND entity_id = $1 AND action = 'correction'",
          [id],
        )
      ).rows[0];
      expect(audit.note).toBe("Confirmed by phone");
      expect(audit.before).toEqual({ question_key: "contact_title", value: "Director" });
      expect(audit.after).toEqual({ question_key: "contact_title", value: "Executive Director" });
      const kinds = (
        await app.query("SELECT kind FROM submission_revision WHERE submission_id = $1 ORDER BY revision", [id])
      ).rows.map((r) => r.kind);
      expect(kinds).toEqual(["submit", "correction"]);
    });
  });

  it("[US-045] rewrites budget lines and table answers as one correction revision with before and after", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");
      await as(daniel);
      const old = (await app.query("SELECT row_id FROM budget_line WHERE submission_id = $1", [id])).rows[0].row_id;
      const added = (await app.query("SELECT gen_random_uuid() AS id")).rows[0].id;
      const lines = [
        {
          row_id: old,
          position: 1,
          category: "OTPS",
          description: "Supplies and rent",
          amount: Number(target.award) - 100,
          actual_spent: null,
        },
        { row_id: added, position: 2, category: "PS", description: "Stipend", amount: 100, actual_spent: null },
      ];
      const rows = [{ age_group: "5 to 9", count: "12" }];
      const revision = (
        await app.query(
          "SELECT app.correct_submission($1, $2::jsonb, $3::jsonb, 'Corrected from the signed budget', $4::jsonb, $5::jsonb, $6::jsonb) AS rev",
          [
            id,
            JSON.stringify({ youth_breakdown: rows }),
            JSON.stringify(lines),
            SNAPSHOT,
            JSON.stringify({ question_key: "budget", value: [] }),
            JSON.stringify({ question_key: "budget", value: lines }),
          ],
        )
      ).rows[0].rev;
      expect(revision).toBe(2);
      const stored = (
        await app.query(
          "SELECT category, description, amount::float8 AS amount FROM budget_line WHERE submission_id = $1 ORDER BY position",
          [id],
        )
      ).rows;
      expect(stored.map((line) => line.description)).toEqual(["Supplies and rent", "Stipend"]);
      expect(stored[0].category).toBe("OTPS");
      const answer = (
        await app.query("SELECT value FROM answer WHERE submission_id = $1 AND question_key = 'youth_breakdown'", [id])
      ).rows[0].value;
      expect(answer).toEqual(rows);
      const audit = (
        await app.query(
          "SELECT note, after FROM audit_event WHERE entity = 'submission' AND entity_id = $1 AND action = 'correction'",
          [id],
        )
      ).rows[0];
      expect(audit.note).toBe("Corrected from the signed budget");
      expect(audit.after.value).toHaveLength(2);

      await app.query("SAVEPOINT removal");
      await app.query(
        "SELECT app.correct_submission($1, NULL, $2::jsonb, 'Removed a duplicate line', $3::jsonb, '{}'::jsonb, '{}'::jsonb)",
        [id, JSON.stringify([lines[0]]), SNAPSHOT],
      );
      expect(
        (await app.query("SELECT count(*)::int AS n FROM budget_line WHERE submission_id = $1", [id])).rows[0].n,
      ).toBe(1);
      await app.query("ROLLBACK TO SAVEPOINT removal");
    });
  });

  it("[US-045] refuses a budget or table correction without a reason or by a non-reviewer", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");
      await as(daniel);
      await app.query("SAVEPOINT noreason");
      expect(
        await errorCode(() =>
          app.query("SELECT app.correct_submission($1, NULL, '[]'::jsonb, '', $2::jsonb, '{}'::jsonb, '{}'::jsonb)", [
            id,
            SNAPSHOT,
          ]),
        ),
      ).toBe("23514");
      await app.query("ROLLBACK TO SAVEPOINT noreason");
      await as(grace);
      expect(
        await errorCode(() =>
          app.query(
            "SELECT app.correct_submission($1, NULL, '[]'::jsonb, 'why', $2::jsonb, '{}'::jsonb, '{}'::jsonb)",
            [id, SNAPSHOT],
          ),
        ),
      ).toBe("42501");
    });
  });

  it("is refused for a view-only user and for the reporting organization", async () => {
    await inTransaction(async () => {
      const id = await startDraft(maria);
      await transition(maria, id, "submit");
      await as(grace);
      await app.query("SAVEPOINT g");
      expect(
        await errorCode(() =>
          app.query("SELECT app.correct_answer($1, 'contact_title', '\"X\"', 'why', $2::jsonb)", [id, SNAPSHOT]),
        ),
      ).toBe("42501");
      await app.query("ROLLBACK TO SAVEPOINT g");
      await as(maria);
      expect(
        await errorCode(() =>
          app.query("SELECT app.correct_answer($1, 'contact_title', '\"X\"', 'why', $2::jsonb)", [id, SNAPSHOT]),
        ),
      ).toBe("42501");
    });
  });
});

describe("[BR-006] one report per initiative and period", () => {
  it("refuses a second report for the same assignment and period", async () => {
    await inTransaction(async () => {
      await startDraft(maria);
      await app.query("SAVEPOINT dup");
      const code = await errorCode(() =>
        app.query(
          `INSERT INTO submission (id, reference_no, assignment_id, period_id, form_version_id, status, started_by, updated_by)
           VALUES (gen_random_uuid(), 'LL-TEST-DUP', $1, 'FY27-MY', $2, 'draft', app.uid(), app.uid())`,
          [target.assignment, target.form],
        ),
      );
      expect(code).toBe("23505");
    });
  });

  it("gives an organization with several initiatives a separate report for each", async () => {
    const { rows } = await owner.query(
      `SELECT o.id, count(DISTINCT a.initiative_id)::int AS initiatives
       FROM organization o JOIN assignment a ON a.org_id = o.id GROUP BY o.id HAVING count(DISTINCT a.initiative_id) > 1 LIMIT 1`,
    );
    expect(rows[0].initiatives).toBeGreaterThan(1);
    const sharedKeys = await owner.query(
      `SELECT count(*)::int AS n FROM (SELECT assignment_id, period_id FROM submission GROUP BY 1, 2 HAVING count(*) > 1) d`,
    );
    expect(sharedKeys.rows[0].n).toBe(0);
  });
});

describe("[BR-005] an initiative can fund one organization or more than one hundred", () => {
  it("accepts 101 organizations on a single initiative and lets finance read all of them", async () => {
    await owner.query("BEGIN");
    try {
      const initiative = (
        await owner.query(
          `INSERT INTO initiative (code, name, category, description, fiscal_year_id, total_funding)
           VALUES ('ZZ-TEST-BIG', 'Capacity fixture', 'Education', 'Capacity check', (SELECT id FROM fiscal_year ORDER BY id LIMIT 1), 1010000) RETURNING id`,
        )
      ).rows[0].id as string;
      await owner.query(
        `INSERT INTO organization (ein, legal_name, org_type, borough, address_line, postal_code)
         SELECT '99-' || lpad(g::text, 7, '0'), 'Capacity Fixture ' || g, 'cbo', 'Bronx', '1 Main St', '10451' FROM generate_series(1, 101) g`,
      );
      await owner.query(
        `INSERT INTO assignment (initiative_id, org_id, award_amount)
         SELECT $1, id, 10000 FROM organization WHERE ein LIKE '99-%'`,
        [initiative],
      );
      const count = (
        await owner.query("SELECT count(*)::int AS n FROM assignment WHERE initiative_id = $1", [initiative])
      ).rows[0].n;
      expect(count).toBe(101);
    } finally {
      await owner.query("ROLLBACK");
    }
  });
});

describe("[US-036][US-013] finance administers its own users, each person has an account", () => {
  it("lets an administrator change a role and deactivate a user, and nobody else", async () => {
    await inTransaction(async () => {
      await as(priya);
      const changed = await app.query("UPDATE app_user SET role = 'finance_viewer' WHERE id = $1", [daniel]);
      expect(changed.rowCount).toBe(1);
      const deactivated = await app.query("UPDATE app_user SET active = false WHERE id = $1", [grace]);
      expect(deactivated.rowCount).toBe(1);
      await as(daniel);
      const refused = await app.query("UPDATE app_user SET role = 'finance_admin' WHERE id = $1", [daniel]);
      expect(refused.rowCount).toBe(0);
    });
  });

  it("refuses two accounts with the same email and finds a deactivated user no more", async () => {
    await owner.query("BEGIN");
    try {
      const email = (await owner.query("SELECT email FROM app_user WHERE id = $1", [maria])).rows[0].email as string;
      await owner.query("SAVEPOINT dup");
      const duplicate = await errorCode(() =>
        owner.query(
          "INSERT INTO app_user (email, full_name, role, org_id) SELECT email, 'Copy', role, org_id FROM app_user WHERE id = $1",
          [maria],
        ),
      );
      expect(duplicate).toBe("23505");
      await owner.query("ROLLBACK TO SAVEPOINT dup");
      const before = (await owner.query("SELECT count(*)::int AS n FROM app.login_lookup($1)", [email])).rows[0].n;
      expect(before).toBe(1);
      await owner.query("UPDATE app_user SET active = false WHERE id = $1", [maria]);
      const after = (await owner.query("SELECT count(*)::int AS n FROM app.login_lookup($1)", [email])).rows[0].n;
      expect(after).toBe(0);
      const ids = (
        await owner.query(
          "SELECT count(DISTINCT id)::int AS n FROM app.login_lookup('james.okafor@motthavenyouth.example.org')",
        )
      ).rows[0].n;
      expect(ids).toBe(1);
    } finally {
      await owner.query("ROLLBACK");
    }
  });
});
