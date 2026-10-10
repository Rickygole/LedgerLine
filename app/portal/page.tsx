import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { FiscalYearTimeline, type TimelineMark } from "@/components/ui/fiscal-year-timeline";
import { NextAction } from "@/components/portal/next-action";
import { ObligationGroups } from "@/components/portal/obligation-groups";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate, todayInNewYork } from "@/lib/dates";
import { actionFor, loadObligations, loadOrganization, type Obligation } from "@/lib/portal/data";
import { reportProgress } from "@/lib/portal/progress";

export const metadata: Metadata = { title: "My reports" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Period = { id: string; label: string; ends_on: string; due_on: string };
type Year = { id: string; starts_on: string; ends_on: string };

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

function pickNext(obligations: Obligation[]): Obligation | null {
  const byDue = [...obligations].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.initiativeName.localeCompare(b.initiativeName));
  return (
    byDue.find((o) => o.state === "missing") ??
    byDue.find((o) => o.state === "returned") ??
    byDue.find((o) => o.state === "draft") ??
    byDue.find((o) => o.state === "not_started") ??
    null
  );
}

export default async function PortalHome() {
  const user = await requireUser(["cbo_submitter"]);
  const today = todayInNewYork();
  const data = await withClaims(user.id, async (tx) => {
    const obligations = await loadObligations(tx, user.orgId!);
    const next = pickNext(obligations);
    const year =
      (await tx.one<Year>("SELECT id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on FROM fiscal_year WHERE $1::date BETWEEN starts_on AND ends_on", [today])) ??
      (await tx.one<Year>("SELECT id, to_char(starts_on, 'YYYY-MM-DD') AS starts_on, to_char(ends_on, 'YYYY-MM-DD') AS ends_on FROM fiscal_year ORDER BY starts_on DESC LIMIT 1"));
    const periods = await tx.query<Period>(
      "SELECT id, label, to_char(ends_on, 'YYYY-MM-DD') AS ends_on, to_char(due_on, 'YYYY-MM-DD') AS due_on FROM reporting_period ORDER BY due_on"
    );
    return {
      org: await loadOrganization(tx, user.orgId!),
      obligations,
      next,
      progress: next?.submissionId ? await reportProgress(tx, next.submissionId) : null,
      year,
      periods,
    };
  });
  const { org, obligations, next, progress, year, periods } = data;

  const overdue = obligations.filter((o) => o.state === "missing");
  const returned = obligations.filter((o) => o.state === "returned");
  const upcoming = obligations.filter((o) => (o.state === "not_started" || o.state === "draft") && o.dueOn >= today).sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const nextDue = upcoming[0]?.dueOn ?? null;
  const dueTogether = nextDue ? upcoming.filter((o) => o.dueOn === nextDue) : [];

  const title =
    overdue.length > 0
      ? `${overdue.length} ${plural(overdue.length, "report is", "reports are")} overdue`
      : returned.length > 0
        ? `Council Finance asked for changes to ${returned.length} ${plural(returned.length, "report", "reports")}`
        : nextDue
          ? `Your next report is due ${formatDate(nextDue)}`
          : "You are up to date";

  const lede = nextDue
    ? `You have ${dueTogether.length} ${plural(dueTogether.length, "report", "reports")} due by ${formatDate(nextDue)} for ${dueTogether[0].periodLabel}.`
    : obligations.length > 0
      ? "Nothing else is due right now. Council Finance assigns new reports at the start of each fiscal year."
      : "Council Finance has not assigned any reports to your organization yet.";

  const eyebrow = org ? [org.legalName, org.borough, org.councilDistrict ? `District ${org.councilDistrict}` : null].filter(Boolean).join(" · ") : user.orgName ?? "Your organization";

  const marks: TimelineMark[] = [];
  if (year) {
    marks.push({ date: year.starts_on, label: `${year.id} begins`, kind: "boundary" });
    marks.push({ date: year.ends_on, label: `${year.id} ends`, kind: "boundary" });
    for (const period of periods) {
      if (period.ends_on > year.starts_on && period.ends_on < year.ends_on) marks.push({ date: period.ends_on, label: `${period.label.replace(/^FY\d+ /, "")} period ends`, kind: "period-end" });
      if (period.due_on < year.starts_on || period.due_on > year.ends_on) continue;
      const mine = obligations.filter((o) => o.periodId === period.id);
      if (mine.length === 0) continue;
      const late = mine.filter((o) => o.state === "missing").length;
      const open = mine.filter((o) => o.state === "returned" || o.state === "draft" || o.state === "not_started").length;
      const status = late > 0 ? `${late} overdue` : open > 0 ? `${open} to file` : "all submitted";
      marks.push({ date: period.due_on, label: `${period.label} due, ${status}`, kind: "due", state: late > 0 ? "current" : undefined });
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={lede} />

      {next ? (
        <NextAction obligation={next} href={actionFor(next).href} progress={progress} />
      ) : obligations.length > 0 ? (
        <p className="flex items-start gap-2 rounded border border-ok/30 bg-ok-bg px-5 py-4 text-[15px] font-semibold text-ok">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Every report that is due has been submitted. Council Finance will tell you in Messages if anything needs to change.
        </p>
      ) : null}

      {year ? (
        <section aria-labelledby="fy-glance" className="rounded border border-line bg-white">
          <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
            <h2 id="fy-glance" className="text-xl font-bold leading-7 text-ink">
              {year.id} at a glance
            </h2>
            <p className="mt-0.5 text-[15px] text-ink-2">
              {year.id} runs {formatDate(year.starts_on)} to {formatDate(year.ends_on)}. Squares are your report due dates.
            </p>
          </div>
          <div className="px-5 py-4 sm:px-6 sm:py-6">
            <FiscalYearTimeline fiscalYear={year.id} startsOn={year.starts_on} endsOn={year.ends_on} today={today} marks={marks} label={`${year.id} at a glance for your organization`} />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="all-reports" className="rounded border border-line bg-white">
        <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
          <h2 id="all-reports" className="text-xl font-bold leading-7 text-ink">
            Your reports
          </h2>
          <p className="mt-0.5 text-[15px] text-ink-2">One report for each initiative and reporting period. Dates and times are Eastern Time.</p>
        </div>
        <div className="px-5 py-6 sm:px-6">
          <ObligationGroups obligations={obligations} />
        </div>
      </section>
    </div>
  );
}
