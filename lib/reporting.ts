import type { ReportState } from "@/lib/domain";
import { daysPastDue } from "@/lib/dates";

export type Bucket = "outstanding" | "missing" | "submitted" | "in_review" | "returned" | "accepted";

export function reportState(status: string | null, dueOn: string): ReportState {
  if (status === null || status === "draft")
    return daysPastDue(dueOn) > 0 ? "missing" : status === null ? "not_started" : "draft";
  return status as ReportState;
}

export function isMissing(status: string | null, dueOn: string): boolean {
  return (status === null || status === "draft") && daysPastDue(dueOn) > 0;
}

export function bucketFor(status: string | null, dueOn: string): Bucket {
  if (status === null || status === "draft") return daysPastDue(dueOn) > 0 ? "missing" : "outstanding";
  if (status === "returned") return "returned";
  if (status === "submitted") return "submitted";
  if (status === "under_review") return "in_review";
  return "accepted";
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  outstanding: "Not yet due",
  missing: "Missing",
  submitted: "Submitted",
  in_review: "In review",
  returned: "Changes requested",
  accepted: "Accepted",
};
