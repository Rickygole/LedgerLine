import type { ReportState } from "@/components/ui/status-badge";
import { daysPastDue } from "@/lib/dates";

export type Bucket = "outstanding" | "missing" | "incomplete" | "submitted" | "in_review" | "returned" | "accepted";

export function reportState(status: string | null, dueOn: string): ReportState {
  if (status === null || status === "draft") return daysPastDue(dueOn) > 0 ? "missing" : status === null ? "not_started" : "draft";
  return status as ReportState;
}

export function bucketFor(status: string | null, dueOn: string, hasFailingRules: boolean): Bucket {
  const late = daysPastDue(dueOn) > 0;
  if (status === null) return late ? "missing" : "outstanding";
  if (status === "draft" || status === "returned") {
    if (late && hasFailingRules) return "incomplete";
    if (status === "returned") return "returned";
    return late ? "missing" : "outstanding";
  }
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
  outstanding: "Not submitted and not yet due.",
  missing: "Not submitted and past the due date.",
  incomplete: "Draft or returned report past due that still fails required rules.",
  submitted: "Submitted and waiting for review.",
  in_review: "A Finance analyst is reviewing it.",
  returned: "Finance asked the organization for an update.",
  accepted: "Reviewed and accepted by Finance.",
};
