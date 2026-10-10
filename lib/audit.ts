import type { Tx } from "@/lib/db";

export type AuditEntry = {
  entity: string;
  entityId: string | null | undefined;
  action: string;
  note?: string | null;
  before?: unknown;
  after?: unknown;
  aiActionId?: string | null;
};

function asJson(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.query("SELECT app.write_audit($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)", [
    entry.entity,
    entry.entityId ?? null,
    entry.action,
    entry.note ?? null,
    asJson(entry.before),
    asJson(entry.after),
    entry.aiActionId ?? null,
  ]);
}
