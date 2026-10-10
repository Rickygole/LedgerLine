import type { Client } from "pg";
import { ACCEPTED_INITIATIVE, LATE_INITIATIVE, MARIA_ORG, PERSONAS } from "./seed";

export const SCENES = ["fresh", "maria", "daniel", "priya"] as const;
export type Scene = (typeof SCENES)[number];

const HALF_KEYS = [
  "org_legal_name",
  "org_ein",
  "contact_name",
  "contact_title",
  "contact_email",
  "contact_phone",
  "participants_target",
  "accomplishments",
  "challenges",
];
const GUARDED = ["audit_event", "submission_revision", "form_version"];
const FLAG_NOTE = "Verify site count with agency monitor.";

async function oneId(client: Client, sql: string, params: unknown[], what: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(sql, params);
  if (!rows[0]) throw new Error(`${what} was not found. Run pnpm preset fresh first.`);
  return rows[0].id;
}

async function userId(client: Client, email: string): Promise<string> {
  return oneId(client, "SELECT id FROM app_user WHERE email = $1", [email], email);
}

async function mariaSubmission(client: Client, initiative: string, period: string): Promise<string> {
  return oneId(
    client,
    `SELECT s.id FROM submission s
     JOIN assignment a ON a.id = s.assignment_id
     JOIN initiative i ON i.id = a.initiative_id
     JOIN organization o ON o.id = a.org_id
     WHERE o.ein = $1 AND i.name = $2 AND s.period_id = $3`,
    [MARIA_ORG.ein, initiative, period],
    `${initiative} ${period} for ${MARIA_ORG.name}`,
  );
}

async function withGuardsOff<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  for (const table of GUARDED) await client.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
  try {
    return await fn();
  } finally {
    for (const table of GUARDED) await client.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
  }
}

async function clearSubmissionHistory(client: Client, id: string, keep: { outbox: boolean }) {
  await client.query("DELETE FROM ai_action WHERE submission_id = $1", [id]);
  await client.query("DELETE FROM flag WHERE submission_id = $1", [id]);
  await client.query("DELETE FROM attachment WHERE submission_id = $1", [id]);
  await client.query(
    keep.outbox
      ? "DELETE FROM outbox WHERE submission_id = $1 AND template <> 'submission_confirmation'"
      : "DELETE FROM outbox WHERE submission_id = $1",
    [id],
  );
}

async function presetMaria(client: Client) {
  const id = await mariaSubmission(client, LATE_INITIATIVE, "FY26-YE");
  const maria = await userId(client, PERSONAS.maria.email);
  const source = await mariaSubmission(client, LATE_INITIATIVE, "FY26-MY");
  const { rows: half } = await client.query<{ question_key: string; value: unknown }>(
    "SELECT question_key, value FROM answer WHERE submission_id = $1 AND question_key = ANY($2::text[])",
    [source, HALF_KEYS],
  );
  await withGuardsOff(client, async () => {
    await clearSubmissionHistory(client, id, { outbox: false });
    await client.query("DELETE FROM submission_revision WHERE submission_id = $1", [id]);
    await client.query("DELETE FROM audit_event WHERE entity = 'submission' AND entity_id = $1", [id]);
  });
  await client.query("DELETE FROM answer WHERE submission_id = $1", [id]);
  await client.query("DELETE FROM budget_line WHERE submission_id = $1", [id]);
  await client.query("DELETE FROM upload_ticket WHERE submission_id = $1", [id]);
  for (const row of half) {
    await client.query(
      "INSERT INTO answer (submission_id, question_key, value, updated_by, updated_at) VALUES ($1, $2, $3::jsonb, $4, '2026-09-22 16:00:00+00')",
      [id, row.question_key, JSON.stringify(row.value), maria],
    );
  }
  await client.query(
    `UPDATE submission SET status = 'draft', revision = 0, lock_version = 1, submitted_by = NULL, submitted_at = NULL,
            updated_by = $2, updated_at = '2026-09-22 16:00:00+00', last_save_id = NULL WHERE id = $1`,
    [id, maria],
  );
  return `Maria's ${LATE_INITIATIVE} year-end report is a draft again with ${half.length} answers and no budget lines.`;
}

async function presetDaniel(client: Client) {
  const id = await mariaSubmission(client, ACCEPTED_INITIATIVE, "FY26-YE");
  const daniel = await userId(client, PERSONAS.daniel.email);
  await withGuardsOff(client, async () => {
    await clearSubmissionHistory(client, id, { outbox: true });
    await client.query("DELETE FROM submission_revision WHERE submission_id = $1 AND kind <> 'submit'", [id]);
    await client.query(
      "DELETE FROM audit_event WHERE entity = 'submission' AND entity_id = $1 AND action <> 'submit'",
      [id],
    );
    await client.query(
      `INSERT INTO audit_event (at, actor_id, entity, entity_id, action, note, before, after)
       VALUES ('2026-10-06 14:00:00+00', $2, 'submission', $1, 'start_review', NULL, '{"status":"submitted","revision":1}', '{"status":"under_review","revision":1}')`,
      [id, daniel],
    );
  });
  await client.query(
    "INSERT INTO flag (submission_id, kind, source, note, status, created_by, created_at) VALUES ($1, 'manual', 'user', $2, 'open', $3, '2026-10-06 14:05:00+00')",
    [id, FLAG_NOTE, daniel],
  );
  await client.query(
    "UPDATE submission SET status = 'under_review', revision = 1, updated_by = $2, updated_at = '2026-10-06 14:00:00+00' WHERE id = $1",
    [id, daniel],
  );
  return `Maria's ${ACCEPTED_INITIATIVE} year-end report is under review with one open flag.`;
}

async function presetPriya(client: Client) {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM initiative WHERE created_at > (SELECT coalesce(max(at), '-infinity') FROM demo_reset WHERE scene = 'fresh')",
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return "No initiative has been created since the last full reseed. Nothing to remove.";
  const subs = (
    await client.query<{ id: string }>(
      "SELECT s.id FROM submission s JOIN assignment a ON a.id = s.assignment_id WHERE a.initiative_id = ANY($1::uuid[])",
      [ids],
    )
  ).rows.map((r) => r.id);
  await withGuardsOff(client, async () => {
    if (subs.length) {
      for (const table of [
        "ai_action",
        "flag",
        "attachment",
        "outbox",
        "upload_ticket",
        "answer",
        "budget_line",
        "submission_revision",
      ]) {
        await client.query(`DELETE FROM ${table} WHERE submission_id = ANY($1::uuid[])`, [subs]);
      }
      await client.query("DELETE FROM audit_event WHERE entity = 'submission' AND entity_id = ANY($1::text[])", [subs]);
      await client.query("DELETE FROM submission WHERE id = ANY($1::uuid[])", [subs]);
    }
    await client.query(
      "DELETE FROM audit_event WHERE entity IN ('initiative', 'assignment', 'form_version') AND entity_id = ANY($1::text[])",
      [ids],
    );
    await client.query("DELETE FROM assignment WHERE initiative_id = ANY($1::uuid[])", [ids]);
    await client.query("DELETE FROM ai_action WHERE initiative_id = ANY($1::uuid[])", [ids]);
    await client.query(
      "DELETE FROM initiative_lineage WHERE predecessor_id = ANY($1::uuid[]) OR successor_id = ANY($1::uuid[])",
      [ids],
    );
    await client.query("DELETE FROM form_version WHERE initiative_id = ANY($1::uuid[])", [ids]);
    await client.query("DELETE FROM initiative WHERE id = ANY($1::uuid[])", [ids]);
    await client.query(
      "DELETE FROM question WHERE scope = 'initiative' AND created_at > (SELECT coalesce(max(at), '-infinity') FROM demo_reset WHERE scene = 'fresh')",
    );
  });
  return `Removed ${ids.length} initiative${ids.length === 1 ? "" : "s"} created since the last full reseed, with their forms, awards and reports.`;
}

export async function applyPreset(
  client: Client,
  scene: Exclude<Scene, "fresh">,
  options: { ownTransaction?: boolean } = {},
): Promise<string> {
  const own = options.ownTransaction ?? true;
  if (own) await client.query("BEGIN");
  try {
    const message =
      scene === "maria"
        ? await presetMaria(client)
        : scene === "daniel"
          ? await presetDaniel(client)
          : await presetPriya(client);
    await client.query("INSERT INTO demo_reset (scene) VALUES ($1)", [scene]);
    if (own) await client.query("COMMIT");
    return message;
  } catch (error) {
    if (own) await client.query("ROLLBACK");
    throw error;
  }
}
