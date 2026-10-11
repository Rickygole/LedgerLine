import { isUuid } from "@/lib/ids";
import { counted } from "@/lib/format";

export const MAX_SCOPE_AGENCIES = 20;
export const MAX_SCOPE_INITIATIVES = 100;

export type AccessScope = { agencies: string[]; initiatives: string[] };

export type ScopeParse = { ok: true; scope: AccessScope } | { ok: false; error: string };

export function parseScope(agencyValues: unknown[], initiativeValues: unknown[], knownAgencies: string[]): ScopeParse {
  const known = new Set(knownAgencies);
  const agencies: string[] = [];
  for (const value of agencyValues) {
    const agency = String(value ?? "")
      .trim()
      .toUpperCase();
    if (!agency) continue;
    if (!known.has(agency)) return { ok: false, error: `${agency.slice(0, 40)} is not an administering agency.` };
    if (!agencies.includes(agency)) agencies.push(agency);
  }
  const initiatives: string[] = [];
  for (const value of initiativeValues) {
    const id = String(value ?? "")
      .trim()
      .toLowerCase();
    if (!id) continue;
    if (!isUuid(id)) return { ok: false, error: "One of the chosen initiatives could not be found." };
    if (!initiatives.includes(id)) initiatives.push(id);
  }
  if (agencies.length > MAX_SCOPE_AGENCIES) return { ok: false, error: "Choose 20 agencies or fewer." };
  if (initiatives.length > MAX_SCOPE_INITIATIVES) return { ok: false, error: "Choose 100 initiatives or fewer." };
  return { ok: true, scope: { agencies, initiatives } };
}

export function describeScope(scope: AccessScope): string | null {
  const parts: string[] = [];
  if (scope.agencies.length > 0) parts.push(scope.agencies.join(", "));
  if (scope.initiatives.length > 0) parts.push(counted(scope.initiatives.length, "initiative"));
  return parts.length > 0 ? parts.join(" and ") : null;
}

export function scopeLabel(scope: AccessScope): string {
  return describeScope(scope) ?? "All agencies";
}
