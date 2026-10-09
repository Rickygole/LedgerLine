import Link from "next/link";
import { actionInWords } from "@/lib/finance/review/audit-words";
import { formatDateTime } from "@/lib/dates";

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
  if (items.length === 0) return <p className="px-5 py-8 text-center text-sm text-muted">No activity has been recorded yet.</p>;
  return (
    <ol className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.id} className="px-5 py-3 text-sm">
          <p className="text-ink">
            <span className="font-semibold">{item.actor ?? "System"}</span> {actionInWords(item.action)}
            {item.referenceNo && item.submissionId ? (
              <>
                {" "}
                on{" "}
                <Link href={`/finance/submissions/${item.submissionId}`} className="font-semibold text-navy-700 hover:underline">
                  {item.referenceNo}
                </Link>
              </>
            ) : null}
            {item.ai ? <span className="ml-2 rounded bg-info-bg px-1.5 py-0.5 text-xs font-semibold text-info">AI drafted</span> : null}
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
