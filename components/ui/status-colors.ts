export const STATUS_SERIES = [
  { key: "accepted", label: "Accepted", color: "#1a7f37" },
  { key: "in_review", label: "In review", color: "#1f4e85" },
  { key: "submitted", label: "Submitted", color: "#6cb4ee" },
  { key: "returned", label: "Update requested", color: "#c98a0b" },
  { key: "missing", label: "Missing", color: "#b42318" },
  { key: "outstanding", label: "Not yet due", color: "#d5dae1" },
] as const;

export type StatusSeriesKey = (typeof STATUS_SERIES)[number]["key"];

export const STATUS_COLOR: Record<StatusSeriesKey, string> = Object.fromEntries(STATUS_SERIES.map((s) => [s.key, s.color])) as Record<StatusSeriesKey, string>;

export const GEO_BINS = [
  { min: 0, max: 0, label: "None", color: "#eef2f6" },
  { min: 1, max: 9, label: "Under 10 percent", color: "#fde3c8" },
  { min: 10, max: 24, label: "10 to 24 percent", color: "#f8b27a" },
  { min: 25, max: 49, label: "25 to 49 percent", color: "#e8743b" },
  { min: 50, max: 100, label: "50 percent or more", color: "#b23a12" },
] as const;
