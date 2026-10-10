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
  { min: 0, max: 0, label: "0", color: "#eef2f6" },
  { min: 1, max: 2, label: "1 to 2", color: "#fde3c8" },
  { min: 3, max: 4, label: "3 to 4", color: "#f8b27a" },
  { min: 5, max: 7, label: "5 to 7", color: "#e8743b" },
  { min: 8, max: Infinity, label: "8 or more", color: "#b23a12" },
] as const;
