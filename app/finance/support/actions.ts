"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { isUuid } from "@/lib/finance/admin/params";
import { dbFailure, failure, success, type OpState } from "@/lib/ops/action-state";

export async function closeSupportRequest(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const id = String(formData.get("requestId") ?? "");
  if (!isUuid(id)) return failure("That request could not be found.");
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.close_support_request($1)", [id]));
    return success("The request is closed.");
  } catch (error) {
    return dbFailure(error, { "respond before closing": "Reply to the request before closing it." });
  } finally {
    revalidatePath("/finance/support");
    revalidatePath(`/finance/support/${id}`);
  }
}
