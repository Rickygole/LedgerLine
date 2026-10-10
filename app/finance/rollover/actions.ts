"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { pgCode, withClaims } from "@/lib/db";
import { actionFailure, failure, type ActionState } from "@/lib/actions";
import { validFiscalYear } from "@/lib/lifecycle/rollover";

const entry = z.object({
  initiative_id: z.string().uuid(),
  action: z.enum(["carry", "rename", "combine", "retire"]),
  new_name: z.string().trim().max(160).optional(),
  group: z.string().trim().max(40).optional(),
});

export async function runRollover(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!validFiscalYear(from) || !validFiscalYear(to)) return failure("Fiscal years look like FY27 and FY28.");
  let plan: z.infer<typeof entry>[];
  try {
    plan = z.array(entry).parse(JSON.parse(String(formData.get("plan") ?? "[]")));
  } catch {
    return failure("The plan could not be read. Go back to the plan step and try again.");
  }
  const rename = plan.find((p) => p.action === "rename" && !p.new_name);
  if (rename) return failure("Every renamed initiative needs a new name.");
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.rollover_fiscal_year($1, $2, $3::jsonb)", [from, to, JSON.stringify(plan)]));
  } catch (error) {
    const message = error instanceof Error && pgCode(error) === "23514" ? error.message : null;
    if (message) return failure(message.charAt(0).toUpperCase() + message.slice(1));
    return actionFailure("run_rollover_failed", error);
  }
  redirect(`/finance/rollover/result?from=${from}&to=${to}`);
}
