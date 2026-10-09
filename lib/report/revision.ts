import "server-only";
import type { Tx } from "@/lib/db";
import type { Snapshot } from "@/lib/snapshot";
import type { RevisionView } from "@/components/report/submitted-copy";

export async function loadLatestRevision(tx: Tx, submissionId: string): Promise<RevisionView | null> {
  const row = await tx.one<{ revision: number; kind: "submit" | "correction"; snapshot: Snapshot; sha256: string; created_at: string; full_name: string | null; reason: string | null }>(
    `SELECT r.revision, r.kind, r.snapshot, r.sha256, r.created_at, r.reason, u.full_name
     FROM submission_revision r LEFT JOIN app_user u ON u.id = r.actor
     WHERE r.submission_id = $1 ORDER BY r.revision DESC, r.id DESC LIMIT 1`,
    [submissionId]
  );
  if (!row) return null;
  return {
    revision: row.revision,
    kind: row.kind,
    sha256: row.sha256,
    createdAt: new Date(row.created_at).toISOString(),
    actorName: row.full_name,
    reason: row.reason,
    snapshot: row.snapshot,
  };
}

export async function loadFileIds(tx: Tx, submissionId: string): Promise<Record<string, string>> {
  const rows = await tx.query<{ id: string; path: string }>("SELECT id, path FROM attachment WHERE submission_id = $1", [submissionId]);
  return Object.fromEntries(rows.map((row) => [row.path, row.id]));
}

export async function loadReturnNote(tx: Tx, submissionId: string): Promise<{ note: string; at: string; by: string | null } | null> {
  const row = await tx.one<{ note: string | null; at: string; full_name: string | null }>(
    `SELECT e.note, e.at, u.full_name FROM audit_event e LEFT JOIN app_user u ON u.id = e.actor_id
     WHERE e.entity = 'submission' AND e.entity_id = $1 AND e.action = 'request_update'
     ORDER BY e.at DESC, e.id DESC LIMIT 1`,
    [submissionId]
  );
  if (!row) return null;
  return { note: row.note ?? "", at: new Date(row.at).toISOString(), by: row.full_name };
}
