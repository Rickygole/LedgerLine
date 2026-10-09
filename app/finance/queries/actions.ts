"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { plainError } from "@/lib/finance/admin/errors";
import { isUuid } from "@/lib/finance/admin/params";
import { loadPeriods } from "@/lib/finance/review/data";
import { cleanParams, QUERY_KEYS, toSearch, validateParams } from "@/lib/lifecycle/queries";

export type QueryState = { error?: string } | undefined;

export async function saveQuery(_prev: QueryState, formData: FormData): Promise<QueryState> {
  const user = await requireUser(FINANCE_ROLES);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a name for this query." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  const raw: Record<string, string> = {};
  for (const key of QUERY_KEYS) raw[key] = String(formData.get(key) ?? "");
  let saved: string;
  try {
    saved = await withClaims(user.id, async (tx) => {
      const periods = await loadPeriods(tx);
      const errors = validateParams(raw, periods);
      const first = Object.values(errors)[0];
      if (first) throw Object.assign(new Error(first), { invalidFilter: first });
      const clean = cleanParams(raw, periods);
      await tx.query("INSERT INTO saved_query (owner, name, params) VALUES (app.uid(), $1, $2::jsonb)", [name, JSON.stringify(clean)]);
      return toSearch(clean);
    });
  } catch (error) {
    const invalid = (error as { invalidFilter?: string }).invalidFilter;
    if (invalid) return { error: `A filter is not valid: ${invalid}` };
    if ((error as { code?: string }).code === "23505") return { error: "You already have a saved query with that name. Choose another name." };
    return { error: plainError(error) };
  }
  revalidatePath("/finance/queries");
  redirect(`/finance/queries?${saved}&saved=1`);
}

export async function deleteQuery(formData: FormData): Promise<void> {
  const user = await requireUser(FINANCE_ROLES);
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return;
  await withClaims(user.id, (tx) => tx.query("DELETE FROM saved_query WHERE id = $1 AND owner = app.uid()", [id]));
  revalidatePath("/finance/queries");
}
