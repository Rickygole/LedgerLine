"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { dispatchFor } from "@/lib/outbox-dispatch";
import { plainError } from "@/lib/finance/admin/errors";
import { isoDate, isUuid } from "@/lib/finance/admin/params";
import { todayInNewYork } from "@/lib/dates";
import { plural } from "@/lib/format";

export type ReminderState = { ok?: string; error?: string; fieldErrors?: Record<string, string> } | undefined;

export async function saveRule(_prev: ReminderState, formData: FormData): Promise<ReminderState> {
  const admin = await requireUser(["finance_admin"]);
  const id = String(formData.get("id") ?? "");
  const period = String(formData.get("period") ?? "");
  const days = Number.parseInt(String(formData.get("days") ?? ""), 10);
  const timing = String(formData.get("timing") ?? "before");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const active = formData.get("active") === "on";
  const fieldErrors: Record<string, string> = {};
  if (!Number.isInteger(days) || days < 0 || days > 365) fieldErrors.days = "Enter a whole number of days from 0 to 365.";
  if (!["before", "after"].includes(timing)) fieldErrors.timing = "Choose before or after the due date.";
  if (!subject) fieldErrors.subject = "Enter a subject line.";
  else if (subject.length > 200) fieldErrors.subject = "Keep the subject under 200 characters.";
  if (!body) fieldErrors.body = "Enter the message text.";
  else if (body.length > 4000) fieldErrors.body = "Keep the message under 4,000 characters.";
  if (Object.keys(fieldErrors).length > 0) return { error: "Fix the highlighted fields.", fieldErrors };
  const offset = timing === "before" ? -days : days;
  try {
    await withClaims(admin.id, async (tx) => {
      if (id) {
        if (!isUuid(id)) throw Object.assign(new Error("not found"), { code: "23503" });
        const before = await tx.one<{ offset_days: number; template_subject: string; active: boolean }>("SELECT offset_days, template_subject, active FROM reminder_rule WHERE id = $1", [id]);
        if (!before) throw Object.assign(new Error("not found"), { code: "23503" });
        await tx.query("UPDATE reminder_rule SET offset_days = $2, template_subject = $3, template_body = $4, active = $5 WHERE id = $1", [id, offset, subject, body, active]);
        await tx.query("SELECT app.write_audit('reminder_rule', $1, 'update', NULL, $2::jsonb, $3::jsonb, NULL)", [id, JSON.stringify(before), JSON.stringify({ offset_days: offset, template_subject: subject, active })]);
      } else {
        const created = await tx.one<{ id: string }>(
          "INSERT INTO reminder_rule (period_id, offset_days, template_subject, template_body, active, created_by) VALUES ($1, $2, $3, $4, $5, app.uid()) RETURNING id",
          [period, offset, subject, body, active]
        );
        await tx.query("SELECT app.write_audit('reminder_rule', $1, 'create', NULL, NULL, $2::jsonb, NULL)", [created?.id, JSON.stringify({ period, offset_days: offset, template_subject: subject })]);
      }
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { error: "That period already has a rule for that timing. Edit the existing rule instead." };
    return { error: plainError(error) };
  }
  revalidatePath("/finance/reminders");
  redirect(`/finance/reminders?period=${encodeURIComponent(period)}&saved=1`);
}

export async function toggleRule(_prev: ReminderState, formData: FormData): Promise<ReminderState> {
  const admin = await requireUser(["finance_admin"]);
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!isUuid(id)) return { error: "That rule could not be found." };
  try {
    await withClaims(admin.id, async (tx) => {
      await tx.query("UPDATE reminder_rule SET active = $2 WHERE id = $1", [id, active]);
      await tx.query("SELECT app.write_audit('reminder_rule', $1, $2, NULL, $3::jsonb, $4::jsonb, NULL)", [id, active ? "activate" : "deactivate", JSON.stringify({ active: !active }), JSON.stringify({ active })]);
    });
  } catch (error) {
    return { error: plainError(error) };
  }
  revalidatePath("/finance/reminders");
  return { ok: active ? "Rule turned on." : "Rule turned off." };
}

export async function deleteRule(_prev: ReminderState, formData: FormData): Promise<ReminderState> {
  const admin = await requireUser(["finance_admin"]);
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) return { error: "That rule could not be found." };
  try {
    await withClaims(admin.id, async (tx) => {
      const before = await tx.one<{ period_id: string; offset_days: number; template_subject: string }>("DELETE FROM reminder_rule WHERE id = $1 RETURNING period_id, offset_days, template_subject", [id]);
      if (before) await tx.query("SELECT app.write_audit('reminder_rule', $1, 'delete', NULL, $2::jsonb, NULL, NULL)", [id, JSON.stringify(before)]);
    });
  } catch (error) {
    return { error: plainError(error) };
  }
  revalidatePath("/finance/reminders");
  return { ok: "Rule deleted." };
}

export async function sendNow(_prev: ReminderState, formData: FormData): Promise<ReminderState> {
  const admin = await requireUser(["finance_admin"]);
  const period = String(formData.get("period") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!isoDate(date)) return { error: "Choose a real calendar date." };
  if (date !== todayInNewYork()) return { error: "Reminders can be added to the outbox for today only. Past due notices for another date would reach organizations with the wrong timing." };
  try {
    const queued = await withClaims(admin.id, async (tx) => (await tx.one<{ n: number }>("SELECT app.queue_reminders($1, $2::date) AS n", [period, date]))?.n ?? 0);
    await dispatchFor(admin.id, { limit: 100 });
    revalidatePath("/finance/outbox");
    revalidatePath("/finance/reminders");
    return { ok: queued === 0 ? "Nothing new to send. Every organization that qualifies was already reminded for this date." : `${queued} ${plural(queued, "reminder", "reminders")} added to the outbox.` };
  } catch (error) {
    return { error: plainError(error) };
  }
}

export async function restoreDefaults(_prev: ReminderState, formData: FormData): Promise<ReminderState> {
  const admin = await requireUser(["finance_admin"]);
  const period = String(formData.get("period") ?? "");
  try {
    const added = await withClaims(admin.id, async (tx) => (await tx.one<{ n: number }>("SELECT app.restore_reminder_defaults($1) AS n", [period]))?.n ?? 0);
    revalidatePath("/finance/reminders");
    return { ok: added === 0 ? "The standard schedule is already in place." : `${added} standard rules added.` };
  } catch (error) {
    return { error: plainError(error) };
  }
}
