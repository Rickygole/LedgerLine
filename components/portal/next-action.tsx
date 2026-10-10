import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { DueBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { formatShortDate } from "@/lib/report/format";
import type { Obligation } from "@/lib/portal/data";
import type { ReportProgress } from "@/lib/portal/progress";

export function nextActionLabel(o: Obligation): string {
  if (!o.submissionId) return "Start report";
  if (o.status === "returned") return "Make the requested changes";
  return "Continue report";
}

export function NextAction({ obligation: o, href, progress, today }: { obligation: Obligation; href: string; progress: ReportProgress | null; today: string }) {
  const tone = o.state === "missing" ? "border-l-bad" : o.state === "returned" ? "border-l-warn" : "border-l-action";
  const percent = progress ? Math.round((progress.complete / progress.total) * 100) : 0;
  const open = o.status === null || o.status === "draft" || o.status === "returned";
  return (
    <section aria-labelledby="next-action-title" className={cn("rounded border border-l-4 border-line bg-white p-5 sm:flex sm:items-end sm:justify-between sm:gap-8 sm:px-6", tone)}>
      <div className="min-w-0">
        <p className="eyebrow">Do this next</p>
        <h2 id="next-action-title" className="mt-1 text-xl font-bold leading-7 text-ink">
          {o.initiativeName}, {o.periodLabel} report
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-2">
          <span className="whitespace-nowrap">Due {formatDate(o.dueOn)}</span>
          {open ? <DueBadge daysPastDue={o.pastDue} /> : null}
          {o.state === "returned" ? <span className="font-semibold text-warn">Council Finance asked for changes</span> : null}
          {o.editedAt && o.submissionId ? (
            <span className="text-muted">
              Last edited by {o.editedBy ?? "a colleague"}, {formatShortDate(o.editedAt, today)}
            </span>
          ) : null}
        </p>
        {progress ? (
          <div className="mt-3 flex max-w-[360px] flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="num whitespace-nowrap text-sm font-semibold text-ink-2">
              {progress.complete} of {progress.total} sections complete
            </p>
            <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-sm bg-harbor-100" aria-hidden="true">
              <div className="h-full w-full origin-left bg-ok" style={{ transform: `scaleX(${percent / 100})` }} />
            </div>
          </div>
        ) : null}
      </div>
      <ButtonLink href={href} className="mt-5 shrink-0 max-sm:w-full sm:mt-0">
        {nextActionLabel(o)}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </ButtonLink>
    </section>
  );
}
