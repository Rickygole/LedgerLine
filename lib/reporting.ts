import type { ReportState } from "@/components/ui/status-badge";
import { daysPastDue } from "@/lib/dates";

export type Bucket = "outstanding" | "missing" | "incomplete" | "submitted" | "in_review" | "returned" | "accepted";

export function reportState(status: string | null, dueOn: string): ReportState {
  if (status === null || status === "draft") return daysPastDue(dueOn) > 0 ? "missing" : status === null ? "not_started" : "draft";
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
  outstanding: "Outstanding",
  missing: "Missing",
  incomplete: "Incomplete",
  submitted: "Submitted",
  in_review: "In review",
  returned: "Update requested",
  accepted: "Accepted",
};

export const BUCKET_DEFINITION: Record<Bucket, string> = {
  outstanding: "Nothing submitted yet and the due date has not passed.",
  missing: "Nothing submitted, or only a draft saved, and the due date has passed.",
  incomplete: "Not used. Drafts that fail required rules are reported with the Missing count and carry an Incomplete flag.",
  submitted: "Submitted and waiting for review.",
  in_review: "A Finance analyst is reviewing it.",
  returned: "Finance asked the organization for an update.",
  accepted: "Reviewed and accepted by Finance.",
};
