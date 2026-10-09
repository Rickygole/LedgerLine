"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { plainError } from "@/lib/finance/admin/errors";
import { validFiscalYear } from "@/lib/lifecycle/rollover";

export type RolloverState = { error?: string } | undefined;

const entry = z.object({
  initiative_id: z.string().uuid(),
  action: z.enum(["carry", "rename", "combine", "retire"]),
  new_name: z.string().trim().max(160).optional(),
  group: z.string().trim().max(40).optional(),
});

export async function runRollover(_prev: RolloverState, formData: FormData): Promise<RolloverState> {
  const admin = await requireUser(["finance_admin"]);
  const from = String(formData.get("from") ?? "");
  const to = String(formData.get("to") ?? "");
  if (!validFiscalYear(from) || !validFiscalYear(to)) return { error: "Fiscal years look like FY27 and FY28." };
  let plan: z.infer<typeof entry>[];
  try {
    plan = z.array(entry).parse(JSON.parse(String(formData.get("plan") ?? "[]")));
  } catch {
    return { error: "The plan could not be read. Go back to the plan step and try again." };
  }
  const rename = plan.find((p) => p.action === "rename" && !p.new_name);
  if (rename) return { error: "Every renamed initiative needs a new name." };
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.rollover_fiscal_year($1, $2, $3::jsonb)", [from, to, JSON.stringify(plan)]));
  } catch (error) {
    const message = error instanceof Error && (error as { code?: string }).code === "23514" ? error.message : plainError(error);
    return { error: message.charAt(0).toUpperCase() + message.slice(1) };
  }
  redirect(`/finance/rollover/result?from=${from}&to=${to}`);
}
