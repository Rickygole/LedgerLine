import type { Sponsor } from "./review/types";

export const FUNDING_SOURCES = [
  { value: "local", label: "Local" },
  { value: "citywide", label: "Citywide initiative" },
  { value: "speaker", label: "Speaker" },
  { value: "delegation", label: "Delegation" },
] as const;

export const CONTRACT_STATUSES = [
  { value: "awaiting", label: "Awaiting contract" },
  { value: "pending", label: "Registration pending" },
  { value: "registered", label: "Registered" },
] as const;

export function fundingLabel(value: string): string {
  return FUNDING_SOURCES.find((f) => f.value === value)?.label ?? value;
}

export function contractLabel(value: string): string {
  return CONTRACT_STATUSES.find((c) => c.value === value)?.label ?? value;
}

export function sponsorNames(sponsors: Sponsor[]): string {
  if (sponsors.length === 0) return "None";
  return sponsors.map((s) => `${s.name} (District ${s.district})`).join(", ");
}

export function sponsorShort(sponsors: Sponsor[]): string {
  if (sponsors.length === 0) return "None";
  if (sponsors.length === 1) return sponsors[0].name;
  return `${sponsors[0].name} and ${sponsors.length - 1} more`;
}
