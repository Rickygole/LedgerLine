"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { actionFailure, type ActionState } from "@/lib/actions";
import { isUuid } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

export async function createDraftFromPublished(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["finance_admin"]);
  const initiativeId = String(formData.get("initiativeId") ?? "");
  if (!isUuid(initiativeId)) return { error: "That initiative could not be found." };
  let newId: string;
  try {
    newId = await withClaims(user.id, async (tx) => {
      const source = await tx.one<{ id: string; version: number; definition: unknown }>(
        `SELECT id, version, definition FROM form_version
         WHERE initiative_id = $1 AND status IN ('published', 'superseded')
         ORDER BY (status = 'published') DESC, version DESC LIMIT 1`,
        [initiativeId]
      );
      if (!source) throw Object.assign(new Error("no source form"), { code: "23514" });
      const next = await tx.one<{ next: number }>(`SELECT coalesce(max(version), 0) + 1 AS next FROM form_version WHERE initiative_id = $1`, [initiativeId]);
      const created = await tx.one<{ id: string }>(
        `INSERT INTO form_version (initiative_id, version, status, definition, source, created_by)
         VALUES ($1, $2, 'draft', $3::jsonb, 'manual', $4) RETURNING id`,
        [initiativeId, next!.next, JSON.stringify(source.definition), user.id]
      );
      await writeAudit(tx, {
        entity: "form_version",
        entityId: created!.id,
        action: "create_draft",
        note: `Copied from version ${source.version}`,
        after: { initiative_id: initiativeId, version: next!.next, copied_from: source.version },
      });
      return created!.id;
    });
  } catch (error) {
    return actionFailure("create_draft_from_published_failed", error);
  }
  redirect(`/finance/forms/${newId}`);
}
