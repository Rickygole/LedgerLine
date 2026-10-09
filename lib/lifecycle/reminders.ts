import type { Tx } from "@/lib/db";
import { daysBetween } from "@/lib/dates";

export type PeriodOption = { id: string; label: string; due_on: string };

export type RuleRow = {
  id: string;
  period_id: string;
  offset_days: number;
  template_subject: string;
  template_body: string;
  active: boolean;
  created_at: string;
  sent: number;
  last_sent: string | null;
};

export type TargetRow = {
  rule_id: string;
  offset_days: number;
  org_id: string;
  org_name: string;
  to_email: string;
  contact_name: string;
  initiatives: string;
  subject: string;
  body: string;
  already_sent: boolean;
};

export const PLACEHOLDERS = ["{contact}", "{organization}", "{initiative}", "{period}", "{due_date}"] as const;

export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function renderSubject(template: string, period: { label: string; dueOn: string }): string {
  return template
    .replaceAll("{period}", period.label)
    .replaceAll("{due_date}", longDate(period.dueOn))
    .replaceAll("{organization}", "(organization name)")
    .replaceAll("{initiative}", "(initiative names)");
}

export function describeOffset(days: number): string {
  if (days === 0) return "On the due date";
  const n = Math.abs(days);
  return `${n} ${n === 1 ? "day" : "days"} ${days < 0 ? "before" : "after"} the due date`;
}

export function sendNowSummary(orgs: number, emails: number, date: string): string {
  const org = `${orgs} ${orgs === 1 ? "organization" : "organizations"}`;
  const mail = `${emails} ${emails === 1 ? "email" : "emails"}`;
  return `This will add ${mail} to the outbox for ${org} for ${date}.`;
}

export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function offsetFor(dueOn: string, today: string): number {
  return daysBetween(dueOn, today);
}

export async function listPeriods(tx: Tx): Promise<PeriodOption[]> {
  return tx.query<PeriodOption>("SELECT id, label, due_on::text FROM reporting_period ORDER BY due_on");
}

export async function listRules(tx: Tx, periodId: string): Promise<RuleRow[]> {
  return tx.query<RuleRow>(
    `SELECT r.id, r.period_id, r.offset_days, r.template_subject, r.template_body, r.active, r.created_at::text,
            (SELECT count(*)::int FROM outbox o WHERE o.reminder_key LIKE r.id::text || ':%') AS sent,
            (SELECT max(o.created_at)::text FROM outbox o WHERE o.reminder_key LIKE r.id::text || ':%') AS last_sent
     FROM reminder_rule r WHERE r.period_id = $1 ORDER BY r.offset_days`,
    [periodId]
  );
}

export async function previewTargets(tx: Tx, periodId: string, today: string): Promise<TargetRow[]> {
  return tx.query<TargetRow>("SELECT * FROM app.reminder_targets($1, $2::date)", [periodId, today]);
}
