import type { ReportState } from "@/components/ui/status-badge";
import { reportState } from "@/lib/reporting";

export function expectedState(status: string | null, dueOn: string, published: boolean): ReportState {
  if (!published && (status === null || status === "draft")) return status === null ? "not_started" : "draft";
  return reportState(status, dueOn);
}
