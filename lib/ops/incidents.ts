import type { Tx } from "@/lib/db";
import { daysBetween, toIsoDate } from "@/lib/dates";
import { iso } from "./sql";

export const NOTIFY_WITHIN_HOURS = 24;
export const REMEDIATE_WITHIN_DAYS = 7;
const HOUR = 3_600_000;

export const SEVERITIES = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

export function severityLabel(value: string): string {
  return SEVERITIES.find((s) => s.value === value)?.label ?? value;
}

export function notifyDueAt(detectedAt: Date | string): Date {
  return new Date(new Date(detectedAt).getTime() + NOTIFY_WITHIN_HOURS * HOUR);
}

export function remediationDueAt(detectedAt: Date | string): Date {
  return new Date(new Date(detectedAt).getTime() + REMEDIATE_WITHIN_DAYS * 24 * HOUR);
}

export type DeadlineState = "met" | "late" | "due_soon" | "on_track" | "overdue";

export function notificationDeadline(input: { detectedAt: Date | string; notifiedAt: Date | string | null; now: Date }): { state: DeadlineState; dueAt: Date; minutes: number } {
  const dueAt = notifyDueAt(input.detectedAt);
  if (input.notifiedAt) {
    const delta = Math.round((new Date(input.notifiedAt).getTime() - dueAt.getTime()) / 60_000);
    return { state: delta <= 0 ? "met" : "late", dueAt, minutes: Math.abs(delta) };
  }
  const delta = Math.round((dueAt.getTime() - input.now.getTime()) / 60_000);
  if (delta < 0) return { state: "overdue", dueAt, minutes: -delta };
  return { state: delta <= 4 * 60 ? "due_soon" : "on_track", dueAt, minutes: delta };
}

export function remediationDeadline(input: { detectedAt: Date | string; completedOn: string | null; now: Date }): { state: DeadlineState; dueAt: Date; minutes: number } {
  const dueAt = remediationDueAt(input.detectedAt);
  if (input.completedOn) {
    const dueDay = toIsoDate(dueAt);
    return { state: input.completedOn <= dueDay ? "met" : "late", dueAt, minutes: Math.abs(daysBetween(dueDay, input.completedOn)) * 1440 };
  }
  const delta = Math.round((dueAt.getTime() - input.now.getTime()) / 60_000);
  if (delta < 0) return { state: "overdue", dueAt, minutes: -delta };
  return { state: delta <= 24 * 60 ? "due_soon" : "on_track", dueAt, minutes: delta };
}

type IncidentStatus = "open" | "remediating" | "closed";

export function incidentStatus(latest: { completed_on: string | null } | null): IncidentStatus {
  if (!latest) return "open";
  return latest.completed_on ? "closed" : "remediating";
}

export const STATUS_LABEL: Record<IncidentStatus, string> = { open: "Awaiting remediation report", remediating: "Remediation in progress", closed: "Remediated" };

type IncidentRow = {
  id: string;
  reference: string;
  detected_at: string;
  description: string;
  affected_data: string;
  severity: string;
  notify_due_at: string;
  remediation_due_at: string;
  notified_at: string;
  contacts_notified: number;
  recorded_by_name: string;
  recorded_at: string;
  latest_completed_on: string | null;
  latest_reported_at: string | null;
  reports: number;
};

const SELECT = `
  SELECT i.id, i.reference, ${iso("i.detected_at")} AS detected_at, i.description, i.affected_data, i.severity,
         ${iso("i.notify_due_at")} AS notify_due_at, ${iso("i.remediation_due_at")} AS remediation_due_at, ${iso("i.notified_at")} AS notified_at,
         i.contacts_notified, u.full_name AS recorded_by_name, ${iso("i.recorded_at")} AS recorded_at,
         lr.completed_on::text AS latest_completed_on, ${iso("lr.recorded_at")} AS latest_reported_at,
         (SELECT count(*)::int FROM incident_remediation r WHERE r.incident_id = i.id) AS reports
  FROM security_incident i
  JOIN app_user u ON u.id = i.recorded_by
  LEFT JOIN LATERAL (SELECT * FROM incident_remediation r WHERE r.incident_id = i.id ORDER BY r.id DESC LIMIT 1) lr ON true`;

export async function listIncidents(tx: Tx): Promise<IncidentRow[]> {
  return tx.query<IncidentRow>(`${SELECT} ORDER BY i.detected_at DESC, i.seq DESC`);
}

export async function loadIncident(tx: Tx, id: string): Promise<IncidentRow | null> {
  return tx.one<IncidentRow>(`${SELECT} WHERE i.id = $1`, [id]);
}

type RemediationRow = { id: string; root_cause: string; actions: string; prevention: string; completed_on: string | null; recorded_by_name: string; recorded_at: string };

export async function loadRemediations(tx: Tx, id: string): Promise<RemediationRow[]> {
  return tx.query<RemediationRow>(
    `SELECT r.id::text, r.root_cause, r.actions, r.prevention, r.completed_on::text AS completed_on, u.full_name AS recorded_by_name, ${iso("r.recorded_at")} AS recorded_at
     FROM incident_remediation r JOIN app_user u ON u.id = r.recorded_by WHERE r.incident_id = $1 ORDER BY r.id DESC`,
    [id]
  );
}

type EventRow = { id: string; at: string; actor_name: string; kind: string; detail: string | null };

export async function loadEvents(tx: Tx, id: string): Promise<EventRow[]> {
  return tx.query<EventRow>(
    `SELECT e.id::text, ${iso("e.at")} AS at, u.full_name AS actor_name, e.kind, e.detail FROM incident_event e JOIN app_user u ON u.id = e.actor WHERE e.incident_id = $1 ORDER BY e.id`,
    [id]
  );
}

type ContactRow = { id: string; full_name: string; title: string; email: string; active: boolean };

export async function listContacts(tx: Tx): Promise<ContactRow[]> {
  return tx.query<ContactRow>("SELECT id, full_name, title, email, active FROM incident_contact ORDER BY active DESC, created_at, id");
}

export const EVENT_LABEL: Record<string, string> = {
  recorded: "Incident recorded",
  notified: "Council contacts notified",
  remediation_reported: "Remediation report recorded",
  remediation_completed: "Remediation completed",
};
