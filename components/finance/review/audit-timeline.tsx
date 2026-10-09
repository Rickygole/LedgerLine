import { AiDraftBadge, Badge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/dates";
import { actionInWords, statusInWords } from "@/lib/finance/review/audit-words";
import type { AuditRecord } from "@/lib/finance/review/detail";
import { cn } from "@/lib/cn";

const DOT: Record<string, string> = {
  submit: "bg-navy-600",
  start_review: "bg-navy-600",
  accept: "bg-ok",
  request_update: "bg-warn",
  reopen: "bg-warn",
  correction: "bg-navy-900",
  flag_add: "bg-warn",
  flag_resolve: "bg-ok",
  flag_dismiss: "bg-line-strong",
};

export function AuditTimeline({ events, labels, compact = false }: { events: AuditRecord[]; labels: Record<string, string>; compact?: boolean }) {
  return (
    <ol className="relative">
      {events.map((event, index) => {
        const beforeStatus = statusInWords(event.before?.status);
        const afterStatus = statusInWords(event.after?.status);
        const key = event.action === "correction" ? String(event.after?.question_key ?? "") : "";
        const last = index === events.length - 1;
        return (
          <li key={event.id} className={cn("relative pl-6", last ? "pb-0" : compact ? "pb-4" : "pb-6")}>
            {!last ? <span className="absolute left-[4px] top-3 bottom-0 w-0.5 bg-line" aria-hidden="true" /> : null}
            <span className={cn("absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white", DOT[event.action] ?? "bg-line-strong")} aria-hidden="true" />
            <p className="text-sm text-ink">
              <span className="font-semibold">{event.actor ?? "System"}</span> {actionInWords(event.action)}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <time dateTime={event.at}>{formatDateTime(event.at)}</time>
              {event.aiActionId ? (
                event.aiMode === "fallback" ? <Badge>{`Drafted from the rules, sent by ${event.actor ?? "a reviewer"}`}</Badge> : <AiDraftBadge label={`AI draft, sent by ${event.actor ?? "a reviewer"}`} />
              ) : null}
            </p>
            {beforeStatus && afterStatus && beforeStatus !== afterStatus && !compact ? (
              <p className="mt-1 text-sm text-muted">
                {beforeStatus} to <span className="font-semibold text-ink">{afterStatus}</span>
              </p>
            ) : null}
            {key ? (
              <p className="mt-1 text-sm text-muted">
                {labels[key] ?? key}: <del className="text-muted">{String(event.before?.value ?? "blank")}</del> <span className="font-semibold text-ink">{String(event.after?.value ?? "blank")}</span>
              </p>
            ) : null}
            {event.note ? <p className={cn("mt-2 whitespace-pre-wrap rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink", compact && "line-clamp-4")}>{event.note}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
