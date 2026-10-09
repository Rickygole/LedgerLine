import type { Tx } from "@/lib/db";
import { daysPastDue } from "@/lib/dates";
import { bucketFor, BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { formatCurrency } from "@/lib/rules/money";
import type { Answers, BudgetLine, FormDefinition } from "@/lib/rules/types";
import { balanceMessage, blockingIssues, budgetTotals, validateSubmission } from "@/lib/rules/validate";

export const DEFAULT_PERIOD = "FY26-YE";

export const BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island", "Citywide"] as const;

export const ORG_TYPE_OPTIONS = [
  { value: "cbo", label: "Community organization" },
  { value: "agency", label: "City agency" },
] as const;

export const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "In review" },
  { value: "returned", label: "Update requested" },
  { value: "accepted", label: "Accepted" },
] as const;

export const BUCKET_OPTIONS = (["outstanding", "missing", "incomplete", "submitted", "in_review", "returned", "accepted"] as Bucket[]).map((value) => ({ value, label: BUCKET_LABEL[value] }));

export const FLAG_OPTIONS = [
  { value: "any", label: "Any flag" },
  { value: "unbalanced", label: "Unbalanced budget" },
  { value: "incomplete", label: "Incomplete" },
  { value: "missing", label: "Missing" },
  { value: "validation", label: "Validation errors" },
  { value: "zero_outcomes", label: "Zero outcomes" },
  { value: "low_outcomes", label: "Low outcomes" },
  { value: "manual", label: "Manual flags" },
] as const;

export const QUERY_KEYS = ["period", "category", "initiative", "borough", "district", "org_type", "bucket", "status", "award_min", "award_max", "flag"] as const;
export type QueryKey = (typeof QUERY_KEYS)[number];
export type QueryParams = Partial<Record<QueryKey, string>>;

function oneOf(value: string, allowed: readonly { value: string }[]): string {
  return allowed.some((a) => a.value === value) ? value : "";
}

function wholeNumber(value: string, min: number, max: number): string {
  if (!/^\d{1,12}$/.test(value)) return "";
  const n = Number(value);
  return n >= min && n <= max ? String(n) : "";
}

export function cleanParams(raw: Record<string, string | string[] | undefined>, periodIds: string[]): QueryParams {
  const get = (key: string) => {
    const value = raw[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
  const clean: QueryParams = {};
  const period = get("period");
  clean.period = periodIds.includes(period) ? period : periodIds.includes(DEFAULT_PERIOD) ? DEFAULT_PERIOD : (periodIds[0] ?? DEFAULT_PERIOD);
  const set = (key: QueryKey, value: string) => {
    if (value) clean[key] = value;
  };
  set("category", get("category").slice(0, 80));
  set("initiative", get("initiative").slice(0, 120));
  set("borough", oneOf(get("borough"), BOROUGHS.map((value) => ({ value }))));
  set("district", wholeNumber(get("district"), 1, 51));
  set("org_type", oneOf(get("org_type"), ORG_TYPE_OPTIONS));
  set("bucket", oneOf(get("bucket"), BUCKET_OPTIONS));
  set("status", oneOf(get("status"), STATUS_OPTIONS));
  set("award_min", wholeNumber(get("award_min"), 0, 1_000_000_000));
  set("award_max", wholeNumber(get("award_max"), 0, 1_000_000_000));
  set("flag", oneOf(get("flag"), FLAG_OPTIONS));
  return clean;
}

export function toSearch(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = params[key];
    if (value) search.set(key, value);
  }
  return search.toString();
}

export function resultsHref(params: QueryParams): string {
  const query = toSearch(params);
  return query ? `/finance/submissions?${query}` : "/finance/submissions";
}

export function exportHref(params: QueryParams): string {
  const query = toSearch(params);
  return query ? `/api/export?${query}` : "/api/export";
}

export function describe(params: QueryParams): string[] {
  const lines: string[] = [];
  if (params.period) lines.push(`Period ${params.period}`);
  if (params.category) lines.push(params.category);
  if (params.initiative) lines.push(`Initiative matching "${params.initiative}"`);
  if (params.borough) lines.push(params.borough);
  if (params.district) lines.push(`Council district ${params.district}`);
  if (params.org_type) lines.push(ORG_TYPE_OPTIONS.find((o) => o.value === params.org_type)?.label ?? params.org_type);
  if (params.bucket) lines.push(BUCKET_LABEL[params.bucket as Bucket] ?? params.bucket);
  if (params.status) lines.push(STATUS_OPTIONS.find((o) => o.value === params.status)?.label ?? params.status);
  if (params.award_min) lines.push(`Award at least ${formatCurrency(Number(params.award_min))}`);
  if (params.award_max) lines.push(`Award at most ${formatCurrency(Number(params.award_max))}`);
  if (params.flag) lines.push(FLAG_OPTIONS.find((o) => o.value === params.flag)?.label ?? params.flag);
  return lines;
}

type BaseRow = {
  submission_id: string | null;
  status: string | null;
  award: number;
  form_version_id: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function numberAnswer(answers: Answers, key: string): number | null {
  const value = answers[key];
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function flagReasons(input: { status: string | null; bucket: Bucket; late: number; award: number; budget: BudgetLine[]; answers: Answers; issueCount: number; openKinds: string[] }): Set<string> {
  const reasons = new Set<string>();
  const { status } = input;
  if ((status === "draft" || status === "returned") && input.budget.length > 0) {
    const { total } = budgetTotals(input.budget);
    if (!balanceMessage(total, input.award).balanced) reasons.add("unbalanced");
  }
  if (input.bucket === "incomplete") reasons.add("incomplete");
  if (input.bucket === "missing") reasons.add("missing");
  if ((status === "submitted" || status === "under_review" || status === "accepted") && input.issueCount > 0) reasons.add("validation");
  if (status !== null && status !== "draft" && status !== "returned") {
    const actual = numberAnswer(input.answers, "participants_actual");
    const target = numberAnswer(input.answers, "participants_target");
    if (actual === 0) reasons.add("zero_outcomes");
    else if (actual !== null && target && target > 0 && actual < target * 0.4) reasons.add("low_outcomes");
  }
  const kindMap: Record<string, string> = { unbalanced: "unbalanced", incomplete: "incomplete", validation: "validation", zero_outcomes: "zero_outcomes", manual: "manual", spend_spike: "manual" };
  for (const kind of input.openKinds) reasons.add(kindMap[kind] ?? "manual");
  return reasons;
}

export async function countMatches(tx: Tx, params: QueryParams): Promise<number> {
  const period = await tx.one<{ id: string; due_on: string }>("SELECT id, due_on::text FROM reporting_period WHERE id = $1", [params.period ?? DEFAULT_PERIOD]);
  if (!period) return 0;
  const initiative = (params.initiative ?? "").toLowerCase();
  const base = await tx.query<BaseRow>(
    `SELECT s.id AS submission_id, s.status, a.award_amount::float8 AS award, s.form_version_id
     FROM assignment a
     JOIN organization o ON o.id = a.org_id
     JOIN initiative i ON i.id = a.initiative_id AND i.status = 'active'
     LEFT JOIN submission s ON s.assignment_id = a.id AND s.period_id = $1
     WHERE (s.id IS NOT NULL OR EXISTS (SELECT 1 FROM form_version fv WHERE fv.initiative_id = i.id AND fv.status = 'published'))
       AND ($2 = '' OR i.category = $2)
       AND ($3 = '' OR o.borough = $3)
       AND ($4 = '' OR o.council_district = NULLIF($4, '')::int)
       AND ($5 = '' OR o.org_type = $5)
       AND ($6 = '' OR a.award_amount >= NULLIF($6, '')::numeric)
       AND ($7 = '' OR a.award_amount <= NULLIF($7, '')::numeric)
       AND (($8 = '' AND $9 = '') OR ($9 <> '' AND i.id::text = $9) OR ($9 = '' AND $8 <> '' AND (lower(i.name) LIKE '%' || $8 || '%' OR lower(i.code) LIKE '%' || $8 || '%')))
       AND ($10 = '' OR coalesce(s.status, 'not_started') = $10)`,
    [period.id, params.category ?? "", params.borough ?? "", params.district ?? "", params.org_type ?? "", params.award_min ?? "", params.award_max ?? "", UUID.test(initiative) ? "" : initiative.replace(/[\\%_]/g, (c) => `\\${c}`), UUID.test(initiative) ? initiative : "", params.status ?? ""]
  );
  if (!params.bucket && !params.flag) return base.length;

  const submissionIds = base.map((r) => r.submission_id).filter((id): id is string => id !== null);
  const formIds = [...new Set(base.map((r) => r.form_version_id).filter((id): id is string => id !== null))];
  const answerRows = submissionIds.length
    ? await tx.query<{ submission_id: string; answers: Answers }>("SELECT submission_id, jsonb_object_agg(question_key, value) AS answers FROM answer WHERE submission_id = ANY($1::uuid[]) GROUP BY submission_id", [submissionIds])
    : [];
  const budgetRows = submissionIds.length
    ? await tx.query<{ submission_id: string; row_id: string; position: number; category: "PS" | "OTPS"; description: string; amount: number }>(
        "SELECT submission_id, row_id, position, category, description, amount::float8 AS amount FROM budget_line WHERE submission_id = ANY($1::uuid[]) ORDER BY position",
        [submissionIds]
      )
    : [];
  const formRows = formIds.length ? await tx.query<{ id: string; definition: FormDefinition }>("SELECT id, definition FROM form_version WHERE id = ANY($1::uuid[])", [formIds]) : [];
  const flagRows = submissionIds.length ? await tx.query<{ submission_id: string; kind: string }>("SELECT submission_id, kind FROM flag WHERE status = 'open' AND submission_id = ANY($1::uuid[])", [submissionIds]) : [];

  const answersBy = new Map(answerRows.map((r) => [r.submission_id, r.answers]));
  const budgetBy = new Map<string, BudgetLine[]>();
  for (const line of budgetRows) {
    const list = budgetBy.get(line.submission_id) ?? [];
    list.push({ rowId: line.row_id, position: line.position, category: line.category, description: line.description, amount: line.amount });
    budgetBy.set(line.submission_id, list);
  }
  const forms = new Map(formRows.map((r) => [r.id, r.definition]));
  const kindsBy = new Map<string, string[]>();
  for (const flag of flagRows) kindsBy.set(flag.submission_id, [...(kindsBy.get(flag.submission_id) ?? []), flag.kind]);

  const late = daysPastDue(period.due_on);
  let count = 0;
  for (const row of base) {
    const answers = row.submission_id ? (answersBy.get(row.submission_id) ?? {}) : {};
    const budget = row.submission_id ? (budgetBy.get(row.submission_id) ?? []) : [];
    const definition = row.form_version_id ? (forms.get(row.form_version_id) ?? null) : null;
    const issueCount = definition ? blockingIssues(validateSubmission({ definition, answers, budget, awardAmount: row.award })).length : 0;
    const bucket = bucketFor(row.status, period.due_on, issueCount > 0);
    if (params.bucket && bucket !== params.bucket) continue;
    if (params.flag) {
      const reasons = flagReasons({ status: row.status, bucket, late, award: row.award, budget, answers, issueCount, openKinds: row.submission_id ? (kindsBy.get(row.submission_id) ?? []) : [] });
      if (params.flag === "any" ? reasons.size === 0 : !reasons.has(params.flag)) continue;
    }
    count += 1;
  }
  return count;
}

export async function queryOptions(tx: Tx) {
  const [periods, categories, initiatives] = await Promise.all([
    tx.query<{ id: string; label: string }>("SELECT id, label FROM reporting_period ORDER BY due_on"),
    tx.query<{ category: string }>("SELECT DISTINCT category FROM initiative WHERE status = 'active' ORDER BY category"),
    tx.query<{ name: string }>("SELECT DISTINCT name FROM initiative WHERE status = 'active' ORDER BY name"),
  ]);
  return { periods, categories: categories.map((c) => c.category), initiatives: initiatives.map((i) => i.name) };
}

export type SavedQuery = { id: string; name: string; params: QueryParams; created_at: string };

export async function listSaved(tx: Tx): Promise<SavedQuery[]> {
  return tx.query<SavedQuery>("SELECT id, name, params, created_at::text FROM saved_query WHERE owner = app.uid() ORDER BY created_at DESC");
}
