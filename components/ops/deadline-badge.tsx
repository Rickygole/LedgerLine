import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/status-badge";
import { formatDuration } from "@/lib/ops/support";
import type { DeadlineState } from "@/lib/ops/incidents";

export function DeadlineBadge({
  state,
  minutes,
  kind,
}: {
  state: DeadlineState;
  minutes: number;
  kind: "notice" | "remediation";
}) {
  const noun = kind === "notice" ? "Notice" : "Report";
  if (state === "met")
    return (
      <Badge tone="ok" icon={CheckCircle2}>
        {noun} on time
      </Badge>
    );
  if (state === "late")
    return (
      <Badge tone="bad" icon={AlertTriangle}>
        {noun} late by {formatDuration(minutes)}
      </Badge>
    );
  if (state === "overdue")
    return (
      <Badge tone="bad" icon={AlertTriangle}>
        {noun} overdue by {formatDuration(minutes)}
      </Badge>
    );
  if (state === "due_soon")
    return (
      <Badge tone="warn" icon={Clock}>
        {noun} due in {formatDuration(minutes)}
      </Badge>
    );
  return (
    <Badge tone="info" icon={Clock}>
      {noun} due in {formatDuration(minutes)}
    </Badge>
  );
}
