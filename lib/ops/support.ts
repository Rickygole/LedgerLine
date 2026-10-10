import type { Tx } from "@/lib/db";
import { iso } from "./sql";

export const RESPONSE_TARGET_HOURS = 24;
const HOUR = 3_600_000;

export const CATEGORIES = [
  { value: "account", label: "My account or permissions" },
  { value: "password", label: "Password or sign-in" },
  { value: "report", label: "A report or form" },
  { value: "data", label: "Data, exports or corrections" },
  { value: "other", label: "Something else" },
] as const;

export type SupportCategory = (typeof CATEGORIES)[number]["value"];
export type SupportState = "open" | "responded" | "overdue" | "closed";

export function categoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function dueAt(createdAt: Date | string): Date {
  return new Date(new Date(createdAt).getTime() + RESPONSE_TARGET_HOURS * HOUR);
}

export function supportState(input: { createdAt: Date | string; firstResponseAt: Date | string | null; closedAt?: Date | string | null; now: Date }): SupportState {
  if (input.closedAt) return "closed";
  if (input.firstResponseAt) return "responded";
  return input.now.getTime() > dueAt(input.createdAt).getTime() ? "overdue" : "open";
}

export function responseMinutes(createdAt: Date | string, firstResponseAt: Date | string | null): number | null {
  if (!firstResponseAt) return null;
  return Math.round((new Date(firstResponseAt).getTime() - new Date(createdAt).getTime()) / 60_000);
}

export function metTarget(createdAt: Date | string, firstResponseAt: Date | string | null): boolean | null {
  if (!firstResponseAt) return null;
  return new Date(firstResponseAt).getTime() <= dueAt(createdAt).getTime();
}

export function ageMinutes(createdAt: Date | string, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - new Date(createdAt).getTime()) / 60_000));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest === 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${hours} h ${rest} min`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function targetSummary(rows: { createdAt: string; firstResponseAt: string | null }[]): { responded: number; metTarget: number; medianMinutes: number | null } {
  const times = rows.map((r) => responseMinutes(r.createdAt, r.firstResponseAt)).filter((m): m is number => m !== null).sort((a, b) => a - b);
  const met = rows.filter((r) => metTarget(r.createdAt, r.firstResponseAt) === true).length;
  const median = times.length === 0 ? null : times.length % 2 === 1 ? times[(times.length - 1) / 2] : Math.round((times[times.length / 2 - 1] + times[times.length / 2]) / 2);
  return { responded: times.length, metTarget: met, medianMinutes: median };
}

export type SupportRow = {
  id: string;
  reference: string;
  requester: string;
  requester_name: string;
  requester_email: string;
  requester_role: string;
  org_name: string | null;
  category: string;
  subject: string;
  body: string;
  created_at: string;
  first_response_at: string | null;
  first_responder_name: string | null;
  closed_at: string | null;
};

const SELECT = `
  SELECT r.id, r.reference, r.requester, u.full_name AS requester_name, u.email AS requester_email, u.role AS requester_role, o.legal_name AS org_name,
         r.category, r.subject, r.body, ${iso("r.created_at")} AS created_at, ${iso("r.first_response_at")} AS first_response_at,
         fu.full_name AS first_responder_name, ${iso("r.closed_at")} AS closed_at
  FROM support_request r
  JOIN app_user u ON u.id = r.requester
  LEFT JOIN organization o ON o.id = u.org_id
  LEFT JOIN app_user fu ON fu.id = r.first_responder`;

export async function listSupport(tx: Tx, scope: { requester?: string; state?: string }): Promise<SupportRow[]> {
  const rows = await tx.query<SupportRow>(`${SELECT} WHERE ($1::uuid IS NULL OR r.requester = $1) ORDER BY r.created_at DESC, r.seq DESC LIMIT 500`, [scope.requester ?? null]);
  return rows;
}

export async function loadSupport(tx: Tx, id: string): Promise<SupportRow | null> {
  return tx.one<SupportRow>(`${SELECT} WHERE r.id = $1`, [id]);
}

export type SupportMessage = { id: string; author_name: string; from_staff: boolean; body: string; created_at: string };

export async function loadMessages(tx: Tx, id: string): Promise<SupportMessage[]> {
  return tx.query<SupportMessage>(
    `SELECT m.id::text, coalesce(u.full_name, 'Finance support') AS author_name, m.from_staff, m.body, ${iso("m.created_at")} AS created_at
     FROM support_message m LEFT JOIN app_user u ON u.id = m.author WHERE m.request_id = $1 ORDER BY m.created_at, m.id`,
    [id]
  );
}
