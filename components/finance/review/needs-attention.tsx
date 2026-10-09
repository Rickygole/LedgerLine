import Link from "next/link";
import { ChevronRight, CircleCheck } from "lucide-react";
import type { ComponentType } from "react";
import { Badge, DueBadge } from "@/components/ui/status-badge";
import type { ReportRow } from "@/lib/finance/review/types";
import { cn } from "@/lib/cn";

export type AttentionItem = { label: string; detail: string; count: number; href: string; tone: "bad" | "warn" | "info"; icon: ComponentType<{ className?: string }> };

const DOT = { bad: "text-bad", warn: "text-warn", info: "text-navy-700" };

export function NeedsAttention({ items, overdue, overdueHref }: { items: AttentionItem[]; overdue: ReportRow[]; overdueHref: string }) {
  const open = items.filter((item) => item.count > 0);
  return (
    <section aria-labelledby="attention-heading" className="flex h-full min-w-0 flex-col rounded-xl border border-line bg-white shadow-card">
      <div className="border-b border-line px-5 py-4">
        <h2 id="attention-heading" className="text-[15px] font-semibold leading-6 text-ink">
          Needs attention
        </h2>
        <p className="mt-0.5 text-sm text-muted">Work waiting on Finance or on an organization.</p>
      </div>
      {open.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <CircleCheck className="h-6 w-6 text-muted" aria-hidden="true" />
          <p className="text-[15px] font-semibold text-ink">Nothing needs attention</p>
          <p className="text-sm text-muted">Every report for this period is accepted or on its way.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {open.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link href={item.href} className="group flex items-center gap-3 px-5 py-3 hover:bg-navy-50/40 focus-visible:bg-navy-50/40">
                  <Icon className={cn("h-4 w-4 shrink-0", DOT[item.tone])} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{item.label}</span>
                    <span className="block text-xs text-muted">{item.detail}</span>
                  </span>
                  <span className="num text-lg font-bold text-ink">{item.count}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted group-hover:text-navy-700" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {overdue.length > 0 ? (
        <div className="mt-auto border-t border-line">
          <p className="px-5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Longest overdue</p>
          <ol className="pb-2">
            {overdue.map((row) => (
              <li key={row.assignmentId} className="flex items-start justify-between gap-3 px-5 py-2">
                <span className="min-w-0">
                  <Link href={`/finance/organizations/${row.orgId}`} className="block truncate text-sm font-semibold text-navy-700 hover:underline">
                    {row.orgName}
                  </Link>
                  <span className="block truncate text-xs text-muted">{row.initiativeName}</span>
                </span>
                {row.daysPastDue > 0 ? <DueBadge daysPastDue={row.daysPastDue} /> : <Badge>On time</Badge>}
              </li>
            ))}
          </ol>
          <div className="border-t border-line px-5 py-3">
            <Link href={overdueHref} className="text-sm font-semibold text-navy-700 hover:underline">
              See every missing report
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
