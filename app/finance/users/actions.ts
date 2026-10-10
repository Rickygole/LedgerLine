"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { personNameProblem } from "@/lib/rules/person-name";
import { requireUser } from "@/lib/auth";
import { appOrigin } from "@/lib/origin";
import { pgCode, withClaims } from "@/lib/db";
import { actionFailure, type ActionState } from "@/lib/actions";
import { isUuid } from "@/lib/ids";
import { STAFF_ROLES } from "@/lib/finance/admin/users";
import { writeAudit } from "@/lib/audit";

type Target = { id: string; full_name: string; role: string; active: boolean };

async function loadTarget(tx: Parameters<Parameters<typeof withClaims>[1]>[0], id: string): Promise<Target> {
  const target = await tx.one<Target>(`SELECT id, full_name, role, active FROM app_user WHERE id = $1`, [id]);
  if (!target) throw Object.assign(new Error("user not found"), { code: "23503" });
  return target;
}

export async function changeRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isUuid(userId) || !(STAFF_ROLES as readonly string[]).includes(role)) return { error: "Choose one of the Finance roles." };
  if (userId === admin.id) return { error: "You cannot change your own role. Ask another administrator." };
  try {
    return await withClaims(admin.id, async (tx) => {
      const target = await loadTarget(tx, userId);
      if (target.role === "cbo_submitter") return { error: "Organization accounts keep the organization role." };
      if (target.role === role) return { ok: `${target.full_name} already has that role.` };
      await tx.query(`UPDATE app_user SET role = $2 WHERE id = $1`, [userId, role]);
      await writeAudit(tx, { entity: "app_user", entityId: userId, action: "role_change", before: { role: target.role }, after: { role } });
      return { ok: `Role updated for ${target.full_name}.` };
    });
  } catch (error) {
    return actionFailure("change_role_failed", error);
  } finally {
    revalidatePath("/finance/users");
  }
}

export async function setActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const userId = String(formData.get("userId") ?? "");
  const active = formData.get("active") === "true";
  if (!isUuid(userId)) return { error: "That user could not be found." };
  if (userId === admin.id && !active) return { error: "You cannot deactivate your own account." };
  try {
    return await withClaims(admin.id, async (tx) => {
      const target = await loadTarget(tx, userId);
      if (target.active === active) return { ok: `${target.full_name} is already ${active ? "active" : "inactive"}.` };
      await tx.query(`UPDATE app_user SET active = $2 WHERE id = $1`, [userId, active]);
      await writeAudit(tx, { entity: "app_user", entityId: userId, action: active ? "activate" : "deactivate", before: { active: !active }, after: { active } });
      return { ok: `${target.full_name} is now ${active ? "active" : "inactive"}.` };
    });
  } catch (error) {
    return actionFailure("set_active_failed", error);
  } finally {
    revalidatePath("/finance/users");
  }
}

export async function sendPasswordReset(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const userId = String(formData.get("userId") ?? "");
  if (!isUuid(userId)) return { error: "That user could not be found." };
  const origin = await appOrigin();
  try {
    return await withClaims(admin.id, async (tx) => {
      const target = await loadTarget(tx, userId);
      const issued = await tx.one<{ link: string }>(`SELECT link FROM app.queue_password_reset($1, $2)`, [userId, origin]);
      return { ok: `Reset link issued for ${target.full_name}. The link below is shown only now and works once for 30 minutes. Give it to the person directly.`, link: issued?.link };
    });
  } catch (error) {
    if (pgCode(error) === "23514") return { error: "That user could not be found or is inactive. Activate the account first." };
    return actionFailure("send_password_reset_failed", error);
  } finally {
    revalidatePath("/finance/outbox");
  }
}

const createSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Enter the person's full name.")
      .max(120, "Use 120 characters or fewer.")
      .superRefine((value, ctx) => {
        const problem = personNameProblem(value, "full name");
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
    email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254, "Use 254 characters or fewer."),
    title: z.string().trim().max(120, "Use 120 characters or fewer."),
    role: z.enum(["finance_viewer", "finance_analyst", "finance_admin", "cbo_submitter"], { message: "Choose a role." }),
    orgId: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "cbo_submitter" && !isUuid(value.orgId)) ctx.addIssue({ code: "custom", path: ["orgId"], message: "Choose the organization this person reports for." });
  });

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const values = {
    fullName: String(formData.get("fullName") ?? "").slice(0, 200),
    email: String(formData.get("email") ?? "").slice(0, 300),
    title: String(formData.get("title") ?? "").slice(0, 200),
    role: String(formData.get("role") ?? ""),
    orgId: String(formData.get("orgId") ?? ""),
  };
  const parsed = createSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, values };
  }
  const origin = await appOrigin();
  const data = parsed.data;
  let link: string | undefined;
  try {
    const issued = await withClaims(admin.id, (tx) =>
      tx.one<{ link: string }>(`SELECT link FROM app.create_user($1, $2, $3, $4, $5, $6)`, [data.email, data.fullName, data.title || null, data.role, data.role === "cbo_submitter" ? data.orgId : null, origin])
    );
    link = issued?.link;
  } catch (error) {
    if (pgCode(error) === "23505") return { fieldErrors: { email: "An account with that email address already exists." }, values };
    if (pgCode(error) === "23503") return { fieldErrors: { orgId: "That organization could not be found." }, values };
    return actionFailure("create_user_failed", error, {}, { values });
  } finally {
    revalidatePath("/finance/users");
    revalidatePath("/finance/outbox");
  }
  return { ok: `Account created for ${data.fullName}. The link below is shown only now and works once for 30 minutes. Give it to the person directly.`, link };
}
