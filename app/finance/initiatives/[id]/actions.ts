"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { actionFailure, failure, firstIssue, isoDay, success, trimmed, type ActionState } from "@/lib/actions";
import { todayInNewYork } from "@/lib/dates";
import { ruleViolation } from "@/lib/finance/admin/rule-message";
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
        [initiativeId],
      );
      if (!source) throw Object.assign(new Error("no source form"), { code: "23514" });
      const next = await tx.one<{ next: number }>(
        `SELECT coalesce(max(version), 0) + 1 AS next FROM form_version WHERE initiative_id = $1`,
        [initiativeId],
      );
      const created = await tx.one<{ id: string }>(
        `INSERT INTO form_version (initiative_id, version, status, definition, source, created_by)
         VALUES ($1, $2, 'draft', $3::jsonb, 'manual', $4) RETURNING id`,
        [initiativeId, next!.next, JSON.stringify(source.definition), user.id],
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

function refresh(initiativeId: string) {
  revalidatePath(`/finance/initiatives/${initiativeId}`);
  revalidatePath("/finance/initiatives");
  revalidatePath("/finance");
}

async function runRule(event: string, initiativeId: string, work: () => Promise<ActionState>): Promise<ActionState> {
  try {
    const result = await work();
    refresh(initiativeId);
    return result;
  } catch (error) {
    const message = ruleViolation(error);
    if (message) return failure(message);
    return actionFailure(event, error);
  }
}

const periodId = z.string().regex(/^[A-Za-z0-9-]{3,20}$/, "That reporting period could not be found.");

export async function setRequiredReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["finance_admin"]);
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const parsed = periodId.safeParse(String(formData.get("periodId") ?? ""));
  const required = formData.get("required") === "true";
  if (!isUuid(initiativeId) || !parsed.success) return failure("That report could not be found.");
  return runRule("set_required_report_failed", initiativeId, () =>
    withClaims(user.id, async (tx) => {
      const label = await tx.one<{ label: string }>("SELECT label FROM reporting_period WHERE id = $1", [parsed.data]);
      await tx.query("SELECT app.set_required_period($1, $2, $3)", [initiativeId, parsed.data, required]);
      return success(
        required
          ? `${label?.label ?? "The report"} is required again.`
          : `${label?.label ?? "The report"} is no longer required for this initiative.`,
      );
    }),
  );
}

const customSchema = z.object({
  label: trimmed("a report name", 80),
  due: isoDay("the due date"),
  starts: z.union([z.literal(""), isoDay("the start date")]),
  ends: z.union([z.literal(""), isoDay("the end date")]),
});

export async function addCustomReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["finance_admin"]);
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const values = {
    label: String(formData.get("label") ?? "").slice(0, 200),
    due: String(formData.get("due") ?? ""),
    starts: String(formData.get("starts") ?? ""),
    ends: String(formData.get("ends") ?? ""),
  };
  if (!isUuid(initiativeId)) return failure("That initiative could not be found.");
  const parsed = customSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return failure(firstIssue(parsed.error), { fieldErrors, values });
  }
  const data = parsed.data;
  return runRule("add_custom_report_failed", initiativeId, () =>
    withClaims(user.id, async (tx) => {
      await tx.query("SELECT app.add_custom_report($1, $2, $3::date, $4::date, $5::date)", [
        initiativeId,
        data.label,
        data.starts || null,
        data.ends || null,
        data.due,
      ]);
      return success(`${data.label} is now a required report for this initiative.`);
    }),
  );
}

export async function removeCustomReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["finance_admin"]);
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const parsed = periodId.safeParse(String(formData.get("periodId") ?? ""));
  if (!isUuid(initiativeId) || !parsed.success) return failure("That report could not be found.");
  return runRule("remove_custom_report_failed", initiativeId, () =>
    withClaims(user.id, async (tx) => {
      const label = await tx.one<{ label: string }>("SELECT label FROM reporting_period WHERE id = $1", [parsed.data]);
      await tx.query("SELECT app.remove_custom_report($1, $2)", [initiativeId, parsed.data]);
      return success(`${label?.label ?? "The custom report"} was removed.`);
    }),
  );
}

const renameSchema = z.object({
  name: trimmed("the new name", 160),
  reason: trimmed("the reason", 300),
});

export async function renameInitiative(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["finance_admin"]);
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const values = {
    name: String(formData.get("name") ?? "").slice(0, 400),
    reason: String(formData.get("reason") ?? "").slice(0, 600),
  };
  if (!isUuid(initiativeId)) return failure("That initiative could not be found.");
  const parsed = renameSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return failure(firstIssue(parsed.error), { fieldErrors, values });
  }
  const data = parsed.data;
  return runRule("rename_initiative_failed", initiativeId, () =>
    withClaims(user.id, async (tx) => {
      await tx.query("SELECT app.rename_initiative($1, $2, $3)", [initiativeId, data.name, data.reason]);
      return success(`The initiative is now named ${data.name}. The old name is kept in its history.`);
    }),
  );
}

const retireSchema = z.object({ reason: trimmed("the reason", 300) });

export async function retireInitiative(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["finance_admin"]);
  const initiativeId = String(formData.get("initiativeId") ?? "");
  const values = { reason: String(formData.get("reason") ?? "").slice(0, 600) };
  if (!isUuid(initiativeId)) return failure("That initiative could not be found.");
  const parsed = retireSchema.safeParse(values);
  if (!parsed.success) {
    return failure(firstIssue(parsed.error), { fieldErrors: { reason: firstIssue(parsed.error) }, values });
  }
  const { reason } = parsed.data;
  return runRule("retire_initiative_failed", initiativeId, () =>
    withClaims(user.id, async (tx) => {
      await tx.query("SELECT app.retire_initiative($1, $2, $3::date)", [initiativeId, reason, todayInNewYork()]);
      return success("The initiative is retired. It keeps its history and accepts no new reports.");
    }),
  );
}
