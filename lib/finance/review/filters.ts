import type { Filters } from "./types";

export const DEFAULT_PERIOD = "FY26-YE";
export const PAGE_SIZE = 50;

export const BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island", "Citywide"];

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "In review" },
  { value: "returned", label: "Update requested" },
  { value: "accepted", label: "Accepted" },
];

export const FLAG_LABEL: Record<string, string> = {
  unbalanced: "Unbalanced budget",
  incomplete: "Incomplete",
  missing: "Missing",
  validation: "Validation errors",
  zero_outcomes: "Zero outcomes",
  low_outcomes: "Low outcomes",
  manual: "Manual flags",
};

export const FLAG_ORDER = ["unbalanced", "incomplete", "missing", "validation", "zero_outcomes", "low_outcomes", "manual"] as const;

type Raw = Record<string, string | string[] | undefined>;

function one(raw: Raw, key: string): string {
  const value = raw[key];
  const text = Array.isArray(value) ? value[0] : value;
  return (text ?? "").trim();
}

export function parseFilters(raw: Raw, periodIds: string[]): Filters {
  const period = one(raw, "period");
  const page = Number.parseInt(one(raw, "page"), 10);
  return {
    q: one(raw, "q").slice(0, 120),
    initiative: one(raw, "initiative").slice(0, 120),
    category: one(raw, "category").slice(0, 80),
    borough: one(raw, "borough").slice(0, 40),
    district: /^\d{1,2}$/.test(one(raw, "district")) ? one(raw, "district") : "",
    orgType: ["cbo", "agency"].includes(one(raw, "org_type")) ? one(raw, "org_type") : "",
    awardMin: /^\d{1,10}(\.\d{1,2})?$/.test(one(raw, "award_min")) ? one(raw, "award_min") : "",
    awardMax: /^\d{1,10}(\.\d{1,2})?$/.test(one(raw, "award_max")) ? one(raw, "award_max") : "",
    period: periodIds.includes(period) ? period : periodIds.includes(DEFAULT_PERIOD) ? DEFAULT_PERIOD : (periodIds[0] ?? DEFAULT_PERIOD),
    bucket: one(raw, "bucket").slice(0, 30),
    status: one(raw, "status").slice(0, 30),
    flag: one(raw, "flag").slice(0, 30),
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export function filtersToParams(filters: Partial<Filters>, include: { page?: boolean } = {}): URLSearchParams {
  const params = new URLSearchParams();
  const keys: (keyof Filters)[] = ["q", "initiative", "category", "borough", "district", "orgType", "awardMin", "awardMax", "period", "bucket", "status", "flag"];
  const names: Partial<Record<keyof Filters, string>> = { orgType: "org_type", awardMin: "award_min", awardMax: "award_max" };
  for (const key of keys) {
    const value = filters[key];
    if (typeof value === "string" && value !== "") params.set(names[key] ?? key, value);
  }
  if (include.page && filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params;
}

export function hrefWith(base: string, filters: Partial<Filters>, changes: Partial<Filters>, include: { page?: boolean } = {}): string {
  const params = filtersToParams({ ...filters, ...changes }, include);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function activeFilterCount(filters: Filters): number {
  return [filters.q, filters.initiative, filters.category, filters.borough, filters.district, filters.orgType, filters.awardMin, filters.awardMax, filters.bucket, filters.status, filters.flag].filter((v) => v !== "").length;
}
