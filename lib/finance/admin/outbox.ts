import type { Tx } from "@/lib/db";
import { PAGE_SIZE } from "./params";
import { isUuid } from "@/lib/ids";

type OutboxRow = {
  id: string;
  to_email: string;
  template: string;
  subject: string;
  status: string;
  created_at: string;
  org_id: string | null;
  org_name: string | null;
  submission_id: string | null;
  reference_no: string | null;
  full_count: number;
};

export async function listOutbox(tx: Tx, filters: { template: string; org: string; from: string; to: string; page: number }) {
  const rows = await tx.query<OutboxRow>(
    `SELECT m.id, m.to_email, m.template, m.subject, m.status, m.created_at, m.org_id, o.legal_name AS org_name, m.submission_id, s.reference_no,
            count(*) OVER ()::int AS full_count
     FROM outbox m
     LEFT JOIN organization o ON o.id = m.org_id
     LEFT JOIN submission s ON s.id = m.submission_id
     WHERE ((m.template NOT IN ('password_reset', 'password_set') AND m.template NOT LIKE 'security\_%') OR app.is_admin())
       AND ($1 = '' OR m.template = $1)
       AND ($2 = '' OR m.org_id::text = $2)
       AND ($3 = '' OR m.created_at >= ($3::date)::timestamp AT TIME ZONE 'America/New_York')
       AND ($4 = '' OR m.created_at < (($4::date) + 1)::timestamp AT TIME ZONE 'America/New_York')
     ORDER BY m.created_at DESC, m.id
     LIMIT ${PAGE_SIZE} OFFSET $5`,
    [filters.template, filters.org && isUuid(filters.org) ? filters.org : "", filters.from, filters.to, (filters.page - 1) * PAGE_SIZE]
  );
  return { rows, total: rows[0]?.full_count ?? 0 };
}

export async function outboxFilterOptions(tx: Tx) {
  const templates = await tx.query<{ template: string }>(`SELECT DISTINCT template FROM outbox WHERE (template NOT IN ('password_reset', 'password_set') AND template NOT LIKE 'security\_%') OR app.is_admin() ORDER BY template`);
  const orgs = await tx.query<{ id: string; legal_name: string }>(
    `SELECT DISTINCT o.id, o.legal_name FROM outbox m JOIN organization o ON o.id = m.org_id ORDER BY o.legal_name`
  );
  return { templates: templates.map((t) => t.template), orgs };
}

export async function loadOutboxMessage(tx: Tx, id: string) {
  return tx.one<OutboxRow & { body_text: string; created_by_name: string | null; sent_at: string | null; failure_reason: string | null }>(
    `SELECT m.id, m.to_email, m.template, m.subject, m.body_text, m.status, m.created_at, m.sent_at, m.failure_reason, m.org_id, o.legal_name AS org_name, m.submission_id, s.reference_no,
            u.full_name AS created_by_name, 1 AS full_count
     FROM outbox m
     LEFT JOIN organization o ON o.id = m.org_id
     LEFT JOIN submission s ON s.id = m.submission_id
     LEFT JOIN app_user u ON u.id = m.created_by
     WHERE m.id = $1 AND ((m.template NOT IN ('password_reset', 'password_set') AND m.template NOT LIKE 'security\_%') OR app.is_admin())`,
    [id]
  );
}

export function templateLabel(template: string): string {
  return template.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
