import { todayInNewYork } from "@/lib/dates";
import { CONTRACT_STATUSES, FUNDING_SOURCES } from "@/lib/finance/awards";
import type { Filters, PeriodInfo } from "./types";

export const PAGE_SIZE = 50;

export function defaultPeriodId(periods: Pick<PeriodInfo, "id" | "dueOn">[], today = todayInNewYork()): string {
  const sorted = [...periods].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const past = sorted.filter((p) => p.dueOn <= today);
  return (past.length > 0 ? past[past.length - 1] : sorted[0])?.id ?? "";
}

export const FLAG_LABEL: Record<string, string> = {
  unbalanced: "Unbalanced budget",
  incomplete: "Incomplete",
  missing: "Missing",
  validation: "Validation errors",
  zero_outcomes: "Zero outcomes",
  low_outcomes: "Low outcomes",
  manual: "Manual flags",
};

export const FLAG_ORDER = [
  "unbalanced",
  "incomplete",
  "missing",
  "validation",
  "zero_outcomes",
  "low_outcomes",
  "manual",
] as const;

type Raw = Record<string, string | string[] | undefined>;

function one(raw: Raw, key: string): string {
  const value = raw[key];
  const text = Array.isArray(value) ? value[0] : value;
  return (text ?? "").trim();
}

export function parseFilters(raw: Raw, periods: PeriodInfo[]): Filters {
  const period = one(raw, "period");
  const page = Number.parseInt(one(raw, "page"), 10);
  const member = Number.parseInt(one(raw, "member"), 10);
  return {
    q: one(raw, "q").slice(0, 120),
    initiative: one(raw, "initiative").slice(0, 120),
    category: one(raw, "category").slice(0, 80),
    borough: one(raw, "borough").slice(0, 40),
    district:
      /^\d{1,2}$/.test(one(raw, "district")) && Number(one(raw, "district")) >= 1 && Number(one(raw, "district")) <= 51
        ? String(Number(one(raw, "district")))
        : "",
    by: one(raw, "by") === "sponsor" ? "sponsor" : one(raw, "by") === "location" ? "location" : "",
    orgType: ["cbo", "agency"].includes(one(raw, "org_type")) ? one(raw, "org_type") : "",
    awardMin: /^\d{1,10}(\.\d{1,2})?$/.test(one(raw, "award_min")) ? one(raw, "award_min") : "",
    awardMax: /^\d{1,10}(\.\d{1,2})?$/.test(one(raw, "award_max")) ? one(raw, "award_max") : "",
    member: /^\d{1,2}$/.test(one(raw, "member")) && member >= 1 && member <= 51 ? String(member) : "",
    funding: FUNDING_SOURCES.some((f) => f.value === one(raw, "funding")) ? one(raw, "funding") : "",
    contract: CONTRACT_STATUSES.some((c) => c.value === one(raw, "contract")) ? one(raw, "contract") : "",
    agency: /^[A-Z]{2,6}$/.test(one(raw, "agency")) ? one(raw, "agency") : "",
    period: periods.some((p) => p.id === period) ? period : defaultPeriodId(periods),
    bucket: one(raw, "bucket").slice(0, 30),
    status: one(raw, "status").slice(0, 30),
    flag: one(raw, "flag").slice(0, 30),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function withoutEmptyParams(raw: Raw): string | null {
  const params = new URLSearchParams();
  let dropped = false;
  for (const [key, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined) continue;
      if (item === "") dropped = true;
      else params.append(key, item);
    }
  }
  return dropped ? params.toString() : null;
}

export function filtersToParams(filters: Partial<Filters>, include: { page?: boolean } = {}): URLSearchParams {
  const params = new URLSearchParams();
  const keys: (keyof Filters)[] = [
    "q",
    "initiative",
    "category",
    "borough",
    "district",
    "by",
    "member",
    "funding",
    "contract",
    "agency",
    "orgType",
    "awardMin",
    "awardMax",
    "period",
    "bucket",
    "status",
    "flag",
  ];
  const names: Partial<Record<keyof Filters, string>> = {
    orgType: "org_type",
    awardMin: "award_min",
    awardMax: "award_max",
  };
  for (const key of keys) {
    const value = filters[key];
    if (typeof value === "string" && value !== "") params.set(names[key] ?? key, value);
  }
  if (include.page && filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function hrefWith(
  base: string,
  filters: Partial<Filters>,
  changes: Partial<Filters>,
  include: { page?: boolean } = {},
): string {
  const params = filtersToParams({ ...filters, ...changes }, include);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function activeFilterCount(filters: Filters): number {
  return [
    filters.q,
    filters.initiative,
    filters.category,
    filters.borough,
    filters.district,
    filters.member,
    filters.funding,
    filters.contract,
    filters.agency,
    filters.orgType,
    filters.awardMin,
    filters.awardMax,
    filters.bucket,
    filters.status,
    filters.flag,
  ].filter((v) => v !== "").length;
}
