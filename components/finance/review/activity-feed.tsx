import Link from "next/link";
import { actionInWords } from "@/lib/finance/review/audit-words";
import { formatDateTime } from "@/lib/dates";
import { AiDraftBadge } from "@/components/ui/status-badge";

export type ActivityItem = {
  id: number;
  at: string;
  actor: string | null;
  action: string;
  entity: string;
  submissionId: string | null;
  referenceNo: string | null;
  initiative: string | null;
  ai: boolean;
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <p className="px-5 py-12 text-center text-sm text-muted">No activity has been recorded yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="px-5 py-3 text-sm hover:bg-navy-50/40">
          <p className="text-ink">
            <span className="font-semibold">{item.actor ?? "System"}</span> {actionInWords(item.action)}
            {item.referenceNo && item.submissionId ? (
              <>
                {" "}
                on{" "}
                <Link href={`/finance/submissions/${item.submissionId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                  {item.referenceNo}
                </Link>
              </>
            ) : null}
            {item.ai ? <span className="ml-2 align-middle"><AiDraftBadge /></span> : null}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {item.initiative ? `${item.initiative}. ` : ""}
            <time dateTime={item.at}>{formatDateTime(item.at)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}
