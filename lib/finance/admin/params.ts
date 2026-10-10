export type SearchParams = Record<string, string | string[] | undefined>;

export function one(params: SearchParams, key: string): string {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  return (text ?? "").trim();
}

export function pageNumber(params: SearchParams): number {
  const n = Number.parseInt(one(params, "page"), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000) : 1;
}

export function pickOne<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function buildHref(base: string, params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== null) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `${base}?${text}` : base;
}

export const PAGE_SIZE = 25;

export function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : "";
}
