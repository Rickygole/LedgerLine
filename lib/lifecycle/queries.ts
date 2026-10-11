import type { Tx } from "@/lib/db";
import { CONTRACT_STATUSES, FUNDING_SOURCES } from "@/lib/finance/awards";
import { loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { ORG_TYPES, REPORT_BOROUGHS, STATUS_OPTIONS } from "@/lib/domain";
import { applyFilters, BUCKET_ORDER, isExportable } from "@/lib/finance/review/derive";
import { defaultPeriodId, parseFilters } from "@/lib/finance/review/filters";
import { BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { formatCount, formatCurrency, plural } from "@/lib/format";

export const BUCKET_OPTIONS = BUCKET_ORDER.map((value) => ({ value, label: BUCKET_LABEL[value] }));

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

export const FUNDING_OPTIONS = FUNDING_SOURCES.map((f) => ({ value: f.value, label: f.label }));
export const CONTRACT_OPTIONS = CONTRACT_STATUSES.map((c) => ({ value: c.value, label: c.label }));

export const QUERY_KEYS = [
  "period",
  "category",
  "initiative",
  "borough",
  "district",
  "member",
  "funding",
  "contract",
  "org_type",
  "bucket",
  "status",
  "award_min",
  "award_max",
  "flag",
] as const;
type QueryKey = (typeof QUERY_KEYS)[number];
export type QueryParams = Partial<Record<QueryKey, string>>;
export type QueryErrors = Partial<Record<QueryKey, string>>;

type Raw = Record<string, string | string[] | undefined>;
type PeriodRef = { id: string; dueOn: string };

const MAX_AWARD = 1_000_000_000;

function oneOf(value: string, allowed: readonly { value: string }[]): string {
  return allowed.some((a) => a.value === value) ? value : "";
}

function wholeNumber(value: string, min: number, max: number): string {
  if (!/^\d{1,12}$/.test(value)) return "";
  const n = Number(value);
  return n >= min && n <= max ? String(n) : "";
}

function getValue(raw: Raw, key: string): string {
  const value = raw[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

export function cleanParams(raw: Raw, periods: PeriodRef[]): QueryParams {
  const get = (key: string) => getValue(raw, key);
  const clean: QueryParams = {};
  const period = get("period");
  clean.period = periods.some((p) => p.id === period) ? period : defaultPeriodId(periods);
  const set = (key: QueryKey, value: string) => {
    if (value) clean[key] = value;
  };
  set("category", get("category").slice(0, 80));
  set("initiative", get("initiative").slice(0, 120));
  set(
    "borough",
    oneOf(
      get("borough"),
      REPORT_BOROUGHS.map((value) => ({ value })),
    ),
  );
  set("district", wholeNumber(get("district"), 1, 51));
  set("member", wholeNumber(get("member"), 1, 51));
  set("funding", oneOf(get("funding"), FUNDING_OPTIONS));
  set("contract", oneOf(get("contract"), CONTRACT_OPTIONS));
  set("org_type", oneOf(get("org_type"), ORG_TYPES));
  set("bucket", oneOf(get("bucket"), BUCKET_OPTIONS));
  set("status", oneOf(get("status"), STATUS_OPTIONS));
  set("award_min", wholeNumber(get("award_min"), 0, MAX_AWARD));
  set("award_max", wholeNumber(get("award_max"), 0, MAX_AWARD));
  set("flag", oneOf(get("flag"), FLAG_OPTIONS));
  return clean;
}

export function enteredParams(raw: Raw, periods: PeriodRef[]): QueryParams {
  const entered: QueryParams = {};
  for (const key of QUERY_KEYS) {
    const value = getValue(raw, key);
    if (value) entered[key] = value;
  }
  if (!entered.period || !periods.some((p) => p.id === entered.period)) entered.period = defaultPeriodId(periods);
  return entered;
}

export function validateParams(raw: Raw, periods: PeriodRef[]): QueryErrors {
  const errors: QueryErrors = {};
  const get = (key: string) => getValue(raw, key);
  const choice = (
    key: QueryKey,
    allowed: readonly { value: string }[],
    message = "Choose one of the listed options.",
  ) => {
    const value = get(key);
    if (value && !allowed.some((a) => a.value === value)) errors[key] = message;
  };
  const district = (key: "district" | "member") => {
    const value = get(key);
    if (value && !wholeNumber(value, 1, 51)) errors[key] = "Enter a whole number from 1 to 51.";
  };
  const dollars = (key: "award_min" | "award_max") => {
    const value = get(key);
    if (value && !wholeNumber(value, 0, MAX_AWARD))
      errors[key] = "Enter a whole dollar amount from 0 to 1,000,000,000, with digits only.";
  };
  choice(
    "period",
    periods.map((p) => ({ value: p.id })),
    "Choose one of the reporting periods.",
  );
  choice(
    "borough",
    REPORT_BOROUGHS.map((value) => ({ value })),
  );
  choice("funding", FUNDING_OPTIONS);
  choice("contract", CONTRACT_OPTIONS);
  choice("org_type", ORG_TYPES);
  choice("bucket", BUCKET_OPTIONS);
  choice("status", STATUS_OPTIONS);
  choice("flag", FLAG_OPTIONS);
  district("district");
  district("member");
  dollars("award_min");
  dollars("award_max");
  if (get("category").length > 80) errors.category = "Use 80 characters or fewer.";
  if (get("initiative").length > 120) errors.initiative = "Use 120 characters or fewer.";
  if (
    !errors.award_min &&
    !errors.award_max &&
    get("award_min") &&
    get("award_max") &&
    Number(get("award_min")) > Number(get("award_max"))
  ) {
    errors.award_max = "Award at most cannot be lower than award at least.";
  }
  return errors;
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

export type MemberOption = { district: number; name: string };

export function describe(params: QueryParams, members: MemberOption[] = []): string[] {
  const lines: string[] = [];
  if (params.period) lines.push(`Period ${params.period}`);
  if (params.category) lines.push(params.category);
  if (params.initiative) lines.push(`Initiative matching "${params.initiative}"`);
  if (params.borough) lines.push(params.borough);
  if (params.district) lines.push(`Organization in district ${params.district}`);
  if (params.member)
    lines.push(
      `Sponsor ${members.find((m) => String(m.district) === params.member)?.name ?? `of district ${params.member}`}`,
    );
  if (params.funding) lines.push(FUNDING_OPTIONS.find((o) => o.value === params.funding)?.label ?? params.funding);
  if (params.contract) lines.push(CONTRACT_OPTIONS.find((o) => o.value === params.contract)?.label ?? params.contract);
  if (params.org_type) lines.push(ORG_TYPES.find((o) => o.value === params.org_type)?.label ?? params.org_type);
  if (params.bucket) lines.push(BUCKET_LABEL[params.bucket as Bucket] ?? params.bucket);
  if (params.status) lines.push(STATUS_OPTIONS.find((o) => o.value === params.status)?.label ?? params.status);
  if (params.award_min) lines.push(`Award at least ${formatCurrency(Number(params.award_min))}`);
  if (params.award_max) lines.push(`Award at most ${formatCurrency(Number(params.award_max))}`);
  if (params.flag) lines.push(FLAG_OPTIONS.find((o) => o.value === params.flag)?.label ?? params.flag);
  return lines;
}

export type MatchSummary = { matches: number; exportable: number };

export async function summarizeMatches(tx: Tx, params: QueryParams): Promise<MatchSummary> {
  const periods = await loadPeriods(tx);
  const filters = parseFilters(params, periods);
  const period = periods.find((p) => p.id === filters.period);
  if (!period) return { matches: 0, exportable: 0 };
  const rows = applyFilters(await loadReportRows(tx, period), filters);
  return { matches: rows.length, exportable: rows.filter((row) => isExportable(row.status)).length };
}

export async function countMatches(tx: Tx, params: QueryParams): Promise<number> {
  return (await summarizeMatches(tx, params)).matches;
}

export function exportSummary({ matches, exportable }: MatchSummary): string {
  return `${formatCount(matches)} ${plural(matches, "match", "matches")}, ${formatCount(exportable)} submitted ${plural(exportable, "report", "reports")} included in the export`;
}

export async function queryOptions(tx: Tx) {
  const [periods, categories, initiatives, members] = await Promise.all([
    loadPeriods(tx),
    tx.query<{ category: string }>("SELECT DISTINCT category FROM initiative ORDER BY category"),
    tx.query<{ name: string }>("SELECT DISTINCT name FROM initiative ORDER BY name"),
    tx.query<{ district: number; full_name: string }>(
      "SELECT district, full_name FROM council_member ORDER BY district",
    ),
  ]);
  return {
    periods,
    categories: categories.map((c) => c.category),
    initiatives: initiatives.map((i) => i.name),
    members: members.map<MemberOption>((m) => ({ district: m.district, name: m.full_name })),
  };
}

type SavedQuery = { id: string; name: string; params: QueryParams; created_at: string };

export async function listSaved(tx: Tx): Promise<SavedQuery[]> {
  return tx.query<SavedQuery>(
    "SELECT id, name, params, created_at::text FROM saved_query WHERE owner = app.uid() ORDER BY created_at DESC",
  );
}
