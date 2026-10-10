"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { dispatchFor } from "@/lib/outbox-dispatch";
import { isUuid } from "@/lib/ids";
import { actionFailure, type ActionState, failure, firstIssue, isoDay, success, trimmed } from "@/lib/actions";

const incidentSchema = z.object({
  detectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter when the incident was detected."),
  severity: z.enum(["low", "moderate", "high", "critical"], { message: "Choose a severity." }),
  description: trimmed("what happened", 4000),
  affectedData: trimmed("the data affected", 2000),
});

export async function recordIncident(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = incidentSchema.safeParse({
    detectedAt: String(formData.get("detectedAt") ?? ""),
    severity: String(formData.get("severity") ?? ""),
    description: String(formData.get("description") ?? ""),
    affectedData: String(formData.get("affectedData") ?? ""),
  });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  try {
    const result = await withClaims(admin.id, async (tx) => {
      const row = await tx.one<{ id: string }>("SELECT app.record_incident($1::timestamp AT TIME ZONE 'America/New_York', $2, $3, $4) AS id", [
        parsed.data.detectedAt,
        parsed.data.description,
        parsed.data.affectedData,
        parsed.data.severity,
      ]);
      return tx.one<{ reference: string; contacts: number; on_time: boolean }>(
        "SELECT reference, contacts_notified AS contacts, notified_at <= notify_due_at AS on_time FROM security_incident WHERE id = $1",
        [row?.id]
      );
    });
    await dispatchFor(admin.id);
    const late = result?.on_time ? "" : " The notification deadline had already passed when it was recorded.";
    return success(`${result?.reference} recorded. ${result?.contacts} designated ${result?.contacts === 1 ? "contact was" : "contacts were"} notified through the outbox.${late}`);
  } catch (error) {
    return actionFailure("record_incident_failed", error, { messages: {
      "no designated contacts": "Add at least one active designated contact before recording an incident.",
      "detection time is in the future": "The detection time cannot be in the future.",
    } });
  } finally {
    revalidatePath("/finance/incidents");
    revalidatePath("/finance/outbox");
  }
}

const remediationSchema = z.object({
  incidentId: z.string().refine(isUuid, "That incident could not be found."),
  rootCause: trimmed("the root cause", 4000),
  actions: trimmed("the actions taken", 4000),
  prevention: trimmed("the plan to reduce future risk", 4000),
  completedOn: z.union([z.literal(""), isoDay("the completed date")]),
});

export async function recordRemediation(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = remediationSchema.safeParse({
    incidentId: String(formData.get("incidentId") ?? ""),
    rootCause: String(formData.get("rootCause") ?? ""),
    actions: String(formData.get("actions") ?? ""),
    prevention: String(formData.get("prevention") ?? ""),
    completedOn: String(formData.get("completedOn") ?? ""),
  });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  try {
    await withClaims(admin.id, (tx) =>
      tx.query("SELECT app.record_remediation($1, $2, $3, $4, $5)", [parsed.data.incidentId, parsed.data.rootCause, parsed.data.actions, parsed.data.prevention, parsed.data.completedOn || null])
    );
    await dispatchFor(admin.id);
    return success(parsed.data.completedOn ? "Remediation report saved and marked complete. The designated contacts were notified." : "Remediation report saved. The designated contacts were notified.");
  } catch (error) {
    return actionFailure("record_remediation_failed", error, { messages: { "completed date must fall": "The completed date must be between the detection date and today." } });
  } finally {
    revalidatePath(`/finance/incidents/${parsed.data.incidentId}`);
    revalidatePath("/finance/incidents");
    revalidatePath("/finance/outbox");
  }
}

const contactSchema = z.object({
  name: trimmed("a name", 120),
  title: trimmed("a title", 120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254, "Use 254 characters or fewer for the email address."),
});

export async function addIncidentContact(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const parsed = contactSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    title: String(formData.get("title") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!parsed.success) return failure(firstIssue(parsed.error));
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.add_incident_contact($1, $2, $3)", [parsed.data.name, parsed.data.title, parsed.data.email]));
    return success(`${parsed.data.name} will receive incident notices.`);
  } catch (error) {
    return actionFailure("add_incident_contact_failed", error);
  } finally {
    revalidatePath("/finance/incidents");
  }
}

export async function setIncidentContactActive(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser(["finance_admin"]);
  const id = String(formData.get("contactId") ?? "");
  const active = formData.get("active") === "true";
  if (!isUuid(id)) return failure("That contact could not be found.");
  try {
    await withClaims(admin.id, (tx) => tx.query("SELECT app.set_incident_contact_active($1, $2)", [id, active]));
    return success(active ? "Contact is active." : "Contact is switched off.");
  } catch (error) {
    return actionFailure("set_incident_contact_active_failed", error, { messages: { "at least one contact must stay active": "At least one contact must stay active." } });
  } finally {
    revalidatePath("/finance/incidents");
  }
}
