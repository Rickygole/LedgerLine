import { AlertTriangle, CheckCircle2, Circle, Lock } from "lucide-react";
import { Badge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/dates";
import { type SupportMessage, type SupportState } from "@/lib/ops/support";

export function SupportStateBadge({ state }: { state: SupportState }) {
  if (state === "overdue") return <Badge tone="bad" icon={AlertTriangle}>Overdue</Badge>;
  if (state === "responded") return <Badge tone="ok" icon={CheckCircle2}>Responded</Badge>;
  if (state === "closed") return <Badge icon={Lock}>Closed</Badge>;
  return <Badge tone="info" icon={Circle}>Open</Badge>;
}

export function Thread({ messages }: { messages: SupportMessage[] }) {
  return (
    <ol className="divide-y divide-line border-y border-line">
      {messages.map((message) => (
        <li key={message.id} className="py-3">
          <p className="text-sm">
            <span className="font-bold text-ink">{message.author_name}</span>
            <span className="ml-2 text-muted">{message.from_staff ? "Finance support" : "Requester"}</span>
            <span className="ml-2 text-muted">{formatDateTime(message.created_at)}</span>
          </p>
          <p className="mt-1 max-w-[72ch] whitespace-pre-wrap text-sm leading-6 text-ink">{message.body}</p>
        </li>
      ))}
    </ol>
  );
}
