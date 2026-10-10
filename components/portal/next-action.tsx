import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { DueBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { Obligation } from "@/lib/portal/data";
import type { ReportProgress } from "@/lib/portal/progress";

export function nextActionLabel(o: Obligation): string {
  if (!o.submissionId) return "Start report";
  if (o.status === "returned") return "Make the requested changes";
  return "Continue report";
}

export function NextAction({ obligation: o, href, progress }: { obligation: Obligation; href: string; progress: ReportProgress | null }) {
  const tone = o.state === "missing" ? "border-l-bad" : o.state === "returned" ? "border-l-warn" : "border-l-action";
  const percent = progress ? Math.round((progress.complete / progress.total) * 100) : 0;
  return (
    <section aria-labelledby="next-action-title" className={cn("rounded border border-l-4 border-line bg-white p-5 sm:p-6", tone)}>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 flex-1 basis-[26rem]">
          <p className="text-sm font-semibold leading-5 text-muted">Do this next</p>
          <h2 id="next-action-title" className="mt-1 text-xl font-bold leading-7 text-ink">
            {o.initiativeName}, {o.periodLabel} report
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-[#3d4757]">
            <span>Due {formatDate(o.dueOn)}</span>
            {o.status === null || o.status === "draft" || o.status === "returned" ? <DueBadge daysPastDue={o.pastDue} /> : null}
            {o.state === "returned" ? <span className="font-semibold text-warn">Council Finance asked for changes</span> : null}
          </p>
          {progress ? (
            <div className="mt-4 max-w-md">
              <p className="num text-sm font-semibold text-[#3d4757]">
                {progress.complete} of {progress.total} sections complete
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-navy-100" aria-hidden="true">
                <div className="h-full w-full origin-left bg-ok" style={{ transform: `scaleX(${percent / 100})` }} />
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[15px] text-[#3d4757]">Not started. Starting creates a draft you can save and come back to.</p>
          )}
        </div>
        {o.editedAt && o.submissionId ? (
          <p className="text-sm text-muted sm:max-w-[16rem] sm:text-right">
            Last edited by {o.editedBy ?? "a colleague"}, {formatDateTime(o.editedAt)}
          </p>
        ) : null}
      </div>
      <ButtonLink href={href} className="mt-5 h-11 px-5 text-base max-sm:w-full">
        {nextActionLabel(o)}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </ButtonLink>
    </section>
  );
}
