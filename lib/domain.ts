export const BOROUGHS = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"] as const;

export type Borough = (typeof BOROUGHS)[number];

export const CITYWIDE = "Citywide";

export const REPORT_BOROUGHS = [...BOROUGHS, CITYWIDE] as const;

export type SubmissionStatus = "draft" | "submitted" | "under_review" | "returned" | "accepted";

export type ReportState = "not_started" | SubmissionStatus | "missing";

export type Audience = "finance" | "cbo";

export const STATE_LABEL: Record<ReportState, Record<Audience, string>> = {
  not_started: { finance: "Not started", cbo: "Not started" },
  draft: { finance: "Draft", cbo: "In progress" },
  submitted: { finance: "Submitted", cbo: "Submitted" },
  under_review: { finance: "In review", cbo: "In review" },
  returned: { finance: "Update requested", cbo: "Changes requested" },
  accepted: { finance: "Accepted", cbo: "Accepted" },
  missing: { finance: "Missing", cbo: "Overdue" },
};

export function statusLabel(status: string, audience: Audience = "finance"): string {
  return status in STATE_LABEL ? STATE_LABEL[status as ReportState][audience] : status;
}

export const STATUS_OPTIONS: { value: string; label: string }[] = (
  ["not_started", "draft", "submitted", "under_review", "returned", "accepted"] as const
).map((value) => ({
  value,
  label: STATE_LABEL[value].finance,
}));

export const ORG_TYPES = [
  { value: "cbo", label: "Nonprofit" },
  { value: "agency", label: "City agency" },
] as const;

export function orgTypeLabel(value: string): string {
  return ORG_TYPES.find((t) => t.value === value)?.label ?? value;
}

export const AGENCIES = [
  "ACS",
  "DCLA",
  "DCWP",
  "DFTA",
  "DHS",
  "DOE",
  "DOHMH",
  "DOP",
  "DPR",
  "DYCD",
  "HPD",
  "HRA",
  "MOCJ",
  "MOIA",
  "SBS",
] as const;
