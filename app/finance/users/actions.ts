"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { pgCode, withClaims } from "@/lib/db";
import { plainError } from "@/lib/finance/admin/errors";
import { isUuid } from "@/lib/finance/admin/params";
import { STAFF_ROLES } from "@/lib/finance/admin/users";

export type UserActionState = { ok?: string; error?: string } | undefined;

type Target = { id: string; full_name: string; role: string; active: boolean };

async function loadTarget(tx: Parameters<Parameters<typeof withClaims>[1]>[0], id: string): Promise<Target> {
  const target = await tx.one<Target>(`SELECT id, full_name, role, active FROM app_user WHERE id = $1`, [id]);
  if (!target) throw Object.assign(new Error("user not found"), { code: "23503" });
  return target;
}

export async function changeRole(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
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
      await tx.query(`SELECT app.write_audit('app_user', $1, 'role_change', NULL, $2::jsonb, $3::jsonb, NULL)`, [userId, JSON.stringify({ role: target.role }), JSON.stringify({ role })]);
      return { ok: `Role updated for ${target.full_name}.` };
    });
  } catch (error) {
    return { error: plainError(error) };
  } finally {
    revalidatePath("/finance/users");
  }
}

export async function setActive(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
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
      await tx.query(`SELECT app.write_audit('app_user', $1, $2, NULL, $3::jsonb, $4::jsonb, NULL)`, [userId, active ? "activate" : "deactivate", JSON.stringify({ active: !active }), JSON.stringify({ active })]);
      return { ok: `${target.full_name} is now ${active ? "active" : "inactive"}.` };
    });
  } catch (error) {
    return { error: plainError(error) };
  } finally {
    revalidatePath("/finance/users");
  }
}

export async function sendPasswordReset(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const admin = await requireUser(["finance_admin"]);
  const userId = String(formData.get("userId") ?? "");
  if (!isUuid(userId)) return { error: "That user could not be found." };
  try {
    return await withClaims(admin.id, async (tx) => {
      const target = await loadTarget(tx, userId);
      await tx.query(`SELECT app.queue_password_reset($1)`, [userId]);
      return { ok: `Reset message for ${target.full_name} added to the outbox.` };
    });
  } catch (error) {
    if (pgCode(error) === "23514") return { error: "That user could not be found." };
    return { error: plainError(error) };
  } finally {
    revalidatePath("/finance/outbox");
  }
}
