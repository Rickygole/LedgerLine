import "server-only";
import type { Tx } from "@/lib/db";
import { deleteStoredFile, listStoredFiles } from "@/lib/storage";

export const ORPHAN_AGE_HOURS = 24;

export async function sweepOrphanFiles(tx: Tx, now: Date = new Date()): Promise<{ checked: number; deleted: number }> {
  const cutoff = now.getTime() - ORPHAN_AGE_HOURS * 60 * 60 * 1000;
  const old = (await listStoredFiles()).filter((file) => file.modifiedAt.getTime() < cutoff);
  let deleted = 0;
  for (let i = 0; i < old.length; i += 200) {
    const batch = old.slice(i, i + 200);
    const rows = await tx.query<{ path: string }>("SELECT path FROM attachment WHERE path = ANY($1::text[])", [batch.map((file) => file.pathname)]);
    const kept = new Set(rows.map((row) => row.path));
    for (const file of batch) {
      if (kept.has(file.pathname)) continue;
      await deleteStoredFile(file);
      deleted += 1;
    }
  }
  return { checked: old.length, deleted };
}
