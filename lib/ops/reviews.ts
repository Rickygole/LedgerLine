import type { Tx } from "@/lib/db";

export const CHECKLIST = [
  { key: "initiatives", label: "Initiatives", detail: "Which initiatives to keep, rename, combine or retire." },
  { key: "forms", label: "Report forms and questions", detail: "Standard questions, initiative questions and layouts." },
  { key: "periods", label: "Reporting periods", detail: "Mid-year and year-end dates and reminders." },
  { key: "users", label: "Users and permissions", detail: "Finance accounts, roles and organization contacts." },
  { key: "rules", label: "Validation and reminder rules", detail: "Required totals, limits and reminder schedules." },
] as const;

export type ChecklistKey = (typeof CHECKLIST)[number]["key"];

export const DECISION_AREAS = [...CHECKLIST.map((c) => ({ value: c.key as string, label: c.label })), { value: "other", label: "Something else" }];

export type ReviewRow = {
  id: string;
  fiscal_year_id: string;
  review_date: string;
  status: "draft" | "signed_off";
  signed_off_on: string | null;
  signed_off_by_name: string | null;
  check_initiatives: boolean;
  check_forms: boolean;
  check_periods: boolean;
  check_users: boolean;
  check_rules: boolean;
  participants: number;
  decisions: number;
};

export function checklistDone(review: Pick<ReviewRow, "check_initiatives" | "check_forms" | "check_periods" | "check_users" | "check_rules">): number {
  return [review.check_initiatives, review.check_forms, review.check_periods, review.check_users, review.check_rules].filter(Boolean).length;
}

export function signOffBlockers(review: ReviewRow): string[] {
  const blockers: string[] = [];
  const open = CHECKLIST.length - checklistDone(review);
  if (open > 0) blockers.push(`${open} checklist ${open === 1 ? "item is" : "items are"} not ticked.`);
  if (review.participants === 0) blockers.push("No participants are recorded.");
  if (review.decisions === 0) blockers.push("No decisions are recorded.");
  return blockers;
}

const SELECT = `
  SELECT r.id, r.fiscal_year_id, r.review_date::text AS review_date, r.status, r.signed_off_on::text AS signed_off_on, u.full_name AS signed_off_by_name,
         r.check_initiatives, r.check_forms, r.check_periods, r.check_users, r.check_rules,
         (SELECT count(*)::int FROM annual_review_participant p WHERE p.review_id = r.id) AS participants,
         (SELECT count(*)::int FROM annual_review_decision d WHERE d.review_id = r.id) AS decisions
  FROM annual_review r LEFT JOIN app_user u ON u.id = r.signed_off_by`;

export async function listReviews(tx: Tx): Promise<ReviewRow[]> {
  return tx.query<ReviewRow>(`${SELECT} ORDER BY r.fiscal_year_id DESC`);
}

export async function reviewForYear(tx: Tx, fiscalYear: string): Promise<ReviewRow | null> {
  return tx.one<ReviewRow>(`${SELECT} WHERE r.fiscal_year_id = $1`, [fiscalYear]);
}

export type ParticipantRow = { id: string; full_name: string; affiliation: string };
export type DecisionRow = { id: string; area: string; decision: string; decided_by_name: string; created_at: string };

export async function loadParticipants(tx: Tx, reviewId: string): Promise<ParticipantRow[]> {
  return tx.query<ParticipantRow>("SELECT id, full_name, affiliation FROM annual_review_participant WHERE review_id = $1 ORDER BY created_at, id", [reviewId]);
}

export async function loadDecisions(tx: Tx, reviewId: string): Promise<DecisionRow[]> {
  return tx.query<DecisionRow>(
    `SELECT d.id, d.area, d.decision, u.full_name AS decided_by_name, to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM annual_review_decision d JOIN app_user u ON u.id = d.decided_by WHERE d.review_id = $1 ORDER BY d.created_at, d.id`,
    [reviewId]
  );
}
