import type { Tx } from "@/lib/db";
import { PAGE_SIZE, isUuid } from "./params";

export type AuditRow = {
  id: string;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  entity: string;
  entity_id: string;
  action: string;
  note: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ai_action_id: string | null;
  label: string | null;
  org_name: string | null;
  full_count: number;
};

const SELECT_AUDIT = `
  SELECT e.id::text, e.at, e.actor_id, u.full_name AS actor_name, e.entity, e.entity_id, e.action, e.note, e.before, e.after, e.ai_action_id,
         CASE e.entity
           WHEN 'submission' THEN s.reference_no
           WHEN 'initiative' THEN i.code
           WHEN 'form_version' THEN fi.code || ' v' || fv.version
           WHEN 'app_user' THEN au.full_name
           WHEN 'user' THEN au.full_name
           WHEN 'organization' THEN o.legal_name
           ELSE NULL
         END AS label,
         coalesce(so.legal_name, ao.legal_name) AS org_name,
         count(*) OVER ()::int AS full_count
  FROM audit_event e
  LEFT JOIN app_user u ON u.id = e.actor_id
  LEFT JOIN submission s ON e.entity = 'submission' AND s.id::text = e.entity_id
  LEFT JOIN assignment sa ON sa.id = s.assignment_id
  LEFT JOIN organization so ON so.id = sa.org_id
  LEFT JOIN initiative i ON e.entity = 'initiative' AND i.id::text = e.entity_id
  LEFT JOIN form_version fv ON e.entity = 'form_version' AND fv.id::text = e.entity_id
  LEFT JOIN initiative fi ON fi.id = fv.initiative_id
  LEFT JOIN app_user au ON e.entity IN ('app_user', 'user') AND au.id::text = e.entity_id
  LEFT JOIN organization o ON e.entity = 'organization' AND o.id::text = e.entity_id
  LEFT JOIN organization ao ON ao.id::text = coalesce(e.after ->> 'org_id', e.before ->> 'org_id')`;

export async function listAudit(tx: Tx, filters: { actor: string; entity: string; action: string; from: string; to: string; page: number }) {
  const rows = await tx.query<AuditRow>(
    `${SELECT_AUDIT}
     WHERE ($1 = '' OR e.actor_id::text = $1)
       AND ($2 = '' OR e.entity = $2)
       AND ($3 = '' OR e.action = $3)
       AND ($4 = '' OR e.at >= ($4::date)::timestamp AT TIME ZONE 'America/New_York')
       AND ($5 = '' OR e.at < (($5::date) + 1)::timestamp AT TIME ZONE 'America/New_York')
     ORDER BY e.at DESC, e.id DESC
     LIMIT ${PAGE_SIZE} OFFSET $6`,
    [filters.actor && isUuid(filters.actor) ? filters.actor : "", filters.entity, filters.action, filters.from, filters.to, (filters.page - 1) * PAGE_SIZE]
  );
  return { rows, total: rows[0]?.full_count ?? 0 };
}

export async function orgActivity(tx: Tx, orgId: string, limit = 40) {
  return tx.query<AuditRow>(
    `${SELECT_AUDIT}
     WHERE sa.org_id = $1
     ORDER BY e.at DESC, e.id DESC
     LIMIT ${limit}`,
    [orgId]
  );
}

const ACTION_VERB: Record<string, string> = {
  submit: "submitted",
  start_review: "started review of",
  request_update: "requested an update on",
  accept: "accepted",
  reopen: "reopened",
  correction: "corrected an answer on",
};

export function auditEntityHref(row: Pick<AuditRow, "entity" | "entity_id">): string | null {
  if (row.entity === "submission") return `/finance/submissions/${row.entity_id}`;
  if (row.entity === "initiative") return `/finance/initiatives/${row.entity_id}`;
  if (row.entity === "form_version") return `/finance/forms/${row.entity_id}`;
  if (row.entity === "organization") return `/finance/organizations/${row.entity_id}`;
  if (row.entity === "app_user") return "/finance/users";
  return null;
}

export function auditPhrase(row: AuditRow): { actor: string; verb: string; subject: string } {
  const actor = row.actor_name ?? "The system";
  const label = row.label ?? row.entity_id;
  const after = row.after ?? {};
  const before = row.before ?? {};
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  if (row.entity === "submission") return { actor, verb: ACTION_VERB[row.action] ?? `recorded ${row.action.replace(/_/g, " ")} on`, subject: label };
  if (row.entity === "form_version") {
    const verbs: Record<string, string> = { publish: "published", create_draft: "created a draft of", update: "edited", import: "imported a template into" };
    return { actor, verb: verbs[row.action] ?? `recorded ${row.action.replace(/_/g, " ")} on`, subject: `form ${label}` };
  }
  if (row.entity === "initiative") {
    const verbs: Record<string, string> = { create: "created initiative", update: "updated initiative", funding_recalculated: "recalculated funding for initiative" };
    return { actor, verb: verbs[row.action] ?? `recorded ${row.action.replace(/_/g, " ")} on initiative`, subject: label };
  }
  if (row.entity === "assignment") {
    return { actor, verb: "assigned", subject: `${text(after.org_name) || "an organization"} to ${text(after.initiative_code) || "an initiative"}` };
  }
  if (row.entity === "app_user") {
    if (row.action === "role_change") return { actor, verb: "changed the role of", subject: `${label} from ${text(before.role)} to ${text(after.role)}` };
    if (row.action === "activate") return { actor, verb: "activated", subject: label };
    if (row.action === "deactivate") return { actor, verb: "deactivated", subject: label };
    if (row.action === "password_reset_requested") return { actor, verb: "sent a password reset to", subject: label };
  }
  if (row.entity === "user" && row.action === "sign_in") return { actor, verb: "signed in", subject: "" };
  return { actor, verb: `recorded ${row.action.replace(/_/g, " ")} on`, subject: `${row.entity.replace(/_/g, " ")} ${label}` };
}

export async function auditFilterOptions(tx: Tx) {
  const actors = await tx.query<{ id: string; full_name: string }>(
    `SELECT DISTINCT u.id, u.full_name FROM audit_event e JOIN app_user u ON u.id = e.actor_id ORDER BY u.full_name`
  );
  const entities = await tx.query<{ entity: string }>(`SELECT DISTINCT entity FROM audit_event ORDER BY entity`);
  const actions = await tx.query<{ action: string }>(`SELECT DISTINCT action FROM audit_event ORDER BY action`);
  return { actors, entities: entities.map((e) => e.entity), actions: actions.map((a) => a.action) };
}

export function actionLabel(action: string): string {
  return action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
