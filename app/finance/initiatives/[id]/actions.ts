"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { plainError } from "@/lib/finance/admin/errors";
import { isUuid } from "@/lib/ids";

type DraftState = { error?: string } | undefined;

export async function createDraftFromPublished(_prev: DraftState, formData: FormData): Promise<DraftState> {
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
      await tx.query(`SELECT app.write_audit('form_version', $1, 'create_draft', $2, NULL, $3::jsonb, NULL)`, [
        created!.id,
        `Copied from version ${source.version}`,
        JSON.stringify({ initiative_id: initiativeId, version: next!.next, copied_from: source.version }),
      ]);
      return created!.id;
    });
  } catch (error) {
    return { error: plainError(error) };
  }
  redirect(`/finance/forms/${newId}`);
}
