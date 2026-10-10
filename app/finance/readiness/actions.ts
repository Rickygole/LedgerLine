"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { isUuid } from "@/lib/finance/admin/params";
import { dbFailure, failure, firstIssue, isoDay, success, trimmed, type OpState } from "@/lib/ops/action-state";
import { plural } from "@/lib/format";

const sessionSchema = z.object({
  sessionOn: isoDay("the session date"),
  scenario: trimmed("the scenario", 160),
  tester: trimmed("the tester's name", 120),
  testerRole: trimmed("the tester's role", 120),
  result: z.enum(["passed", "failed", "blocked"], { message: "Choose a result." }),
  notes: z.string().trim().max(2000, "Use 2,000 characters or fewer for the notes."),
  defects: z.string().trim().max(4000),
  severity: z.enum(["minor", "major", "critical"]),
});

export async function recordUatSession(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = sessionSchema.safeParse({
    sessionOn: String(formData.get("sessionOn") ?? ""),
    scenario: String(formData.get("scenario") ?? ""),
    tester: String(formData.get("tester") ?? ""),
    testerRole: String(formData.get("testerRole") ?? ""),
    result: String(formData.get("result") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    defects: String(formData.get("defects") ?? ""),
    severity: String(formData.get("severity") ?? "minor"),
  });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  const defects = parsed.data.defects
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((description) => ({ description: description.slice(0, 1000), severity: parsed.data.severity }));
  try {
    await withClaims(admin.id, (tx) =>
      tx.query("SELECT app.record_uat_session($1, $2, $3, $4, $5, $6, $7::jsonb)", [
        parsed.data.sessionOn,
        parsed.data.scenario,
        parsed.data.tester,
        parsed.data.testerRole,
        parsed.data.result,
        parsed.data.notes || null,
        JSON.stringify(defects),
      ])
    );
    return success(`Session recorded as ${parsed.data.result}${defects.length ? ` with ${defects.length} ${plural(defects.length, "defect", "defects")}` : ""}.`);
  } catch (error) {
    return dbFailure(error, {
      "a passed session cannot list defects": "A passed session cannot list defects. Choose failed or blocked, or remove the defects.",
      "session date is in the future": "The session date cannot be in the future.",
    });
  } finally {
    revalidatePath("/finance/readiness");
  }
}

export async function fixUatDefect(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const id = String(formData.get("defectId") ?? "");
  const on = isoDay("the fixed date").safeParse(String(formData.get("fixedOn") ?? ""));
  if (!isUuid(id)) return failure("That defect could not be found.");
  if (!on.success) return failure(firstIssue(on.error));
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.fix_uat_defect($1, $2)", [id, on.data]));
    return success("Defect marked fixed.");
  } catch (error) {
    return dbFailure(error, { "fixed date must fall": "The fixed date must be between the session and today." });
  } finally {
    revalidatePath("/finance/readiness");
  }
}

const trainingSchema = z.object({
  userId: z.string().refine(isUuid, "Choose a Finance user."),
  module: z.string().min(1, "Choose a module."),
  completedOn: isoDay("the completed date"),
});

export async function recordTraining(_previous: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = trainingSchema.safeParse({
    userId: String(formData.get("userId") ?? ""),
    module: String(formData.get("module") ?? ""),
    completedOn: String(formData.get("completedOn") ?? ""),
  });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.record_training($1, $2, $3)", [parsed.data.userId, parsed.data.module, parsed.data.completedOn]));
    return success("Training recorded.");
  } catch (error) {
    return dbFailure(error, {
      training_record_user_id_module_key_key: "That module is already recorded for this person.",
      "completed date is in the future": "The completed date cannot be in the future.",
      "training is recorded for Finance users only": "Training is recorded for Finance users only.",
    });
  } finally {
    revalidatePath("/finance/readiness");
  }
}
