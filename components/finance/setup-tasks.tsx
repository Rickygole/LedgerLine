import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import type { SetupStatus } from "@/lib/finance/admin/initiatives";
import { formatCompactCurrency } from "@/lib/rules/money";
import { buttonClass } from "@/components/ui/button";

type Tone = "ok" | "info" | "warn" | "neutral";

type Task = { title: string; meta: string; status: string; tone: Tone; link?: { href: string; label: string }; primary?: { href: string; label: string } };

const TONE: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok ring-ok/20",
  info: "bg-harbor-100 text-harbor-700 ring-harbor-700/20",
  warn: "bg-warn-bg text-warn ring-warn/25",
  neutral: "bg-white text-ink-2 ring-line-strong",
};

function nextDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function setupTasks(s: SetupStatus, today: string): Task[] {
  const fy = s.fiscalYear?.id ?? "";
  const prev = s.previousYear ?? "the prior year";
  const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
  const opensOn = s.midYear ? nextDay(s.midYear.endsOn) : null;
  const ready = s.needForm === 0 && s.noOrgs === 0 && s.carried > 0;
  const formsHref = s.needForm === 1 && s.firstNeedForm ? `/finance/initiatives/${s.firstNeedForm}` : "/finance/initiatives?form=none#initiatives";
  const tasks: Task[] = [
    {
      title: `Carry over ${prev} initiatives`,
      meta: s.carried > 0 ? `${plural(s.carried, "initiative", "initiatives")} carried over${s.carriedOn ? ` ${formatDate(s.carriedOn)}` : ""}` : `Nothing has been carried into ${fy} yet.`,
      status: s.carried > 0 ? "Completed" : "Not started",
      tone: s.carried > 0 ? "ok" : "neutral",
      link: s.carried > 0 && s.previousYear ? { href: `/finance/rollover/result?from=${s.previousYear}&to=${fy}`, label: "See what carried over" } : { href: "/finance/rollover", label: "Start the annual rollover" },
    },
    {
      title: `Add new ${fy} initiatives`,
      meta: s.created > 0 ? `${plural(s.created, "new initiative", "new initiatives")}${s.createdWithoutOrgs > 0 ? `, ${s.createdWithoutOrgs} without organizations` : ""}` : "No new initiatives added this year. Add one when the Council funds a new program.",
      status: s.created === 0 ? "None added" : s.createdWithoutOrgs > 0 ? "In progress" : "Completed",
      tone: s.created === 0 ? "neutral" : s.createdWithoutOrgs > 0 ? "info" : "ok",
      link: { href: "/finance/initiatives/new", label: "Create initiative" },
    },
    {
      title: "Build report forms",
      meta: s.needForm > 0 ? `${plural(s.needForm, "active initiative has", "active initiatives have")} no published report form.` : "Every active initiative has a published report form.",
      status: s.needForm > 0 ? `${s.needForm} need a form` : "Completed",
      tone: s.needForm > 0 ? "warn" : "ok",
      link: s.needForm > 0 ? undefined : { href: "/finance/initiatives?form=published#initiatives", label: "Review published forms" },
    },
    {
      title: "Assign organizations and awards",
      meta: s.noOrgs > 0 ? `${plural(s.noOrgs, "active initiative has", "active initiatives have")} no funded organizations yet.` : `${plural(s.awards, "award", "awards")} totaling ${formatCompactCurrency(s.funding)}.`,
      status: s.noOrgs > 0 ? `${s.noOrgs} without organizations` : "Completed",
      tone: s.noOrgs > 0 ? "warn" : "ok",
    },
    {
      title: `Open ${fy} Mid-Year reporting`,
      meta: opensOn ? `${today >= opensOn ? "Opened" : "Opens"} ${formatDate(opensOn)}. Reports due ${formatDate(s.midYear!.dueOn)}.${today < opensOn ? (ready ? " Tasks 1 to 4 are done, so reporting opens on schedule." : " Finish tasks 1 to 4 first.") : ""}` : "No Mid-Year period is set up.",
      status: opensOn && today >= opensOn ? "Open" : "Not started",
      tone: opensOn && today >= opensOn ? "ok" : "neutral",
    },
  ];
  if (s.needForm > 0) tasks[2].primary = { href: formsHref, label: s.needForm === 1 ? "Build the missing form" : `Build the ${s.needForm} missing forms` };
  else if (s.noOrgs > 0 && s.firstNoOrgs) tasks[3].primary = { href: `/finance/initiatives/new?initiative=${s.firstNoOrgs}`, label: s.noOrgs === 1 ? "Assign organizations" : `Assign organizations to ${s.noOrgs} initiatives` };
  else tasks[1].primary = { href: "/finance/initiatives/new", label: "Create initiative" };
  if (tasks[1].primary) tasks[1].link = undefined;
  return tasks;
}

export function SetupTaskList({ status, today }: { status: SetupStatus; today: string }) {
  if (!status.fiscalYear) return null;
  const fy = status.fiscalYear.id;
  const tasks = setupTasks(status, today);
  const done = tasks.filter((t) => t.status === "Completed").length;
  return (
    <section aria-labelledby="setup-title" className="mb-8 rounded border border-line bg-white">
      <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
        <p className="text-sm font-semibold leading-5 text-muted">
          {fy} ({formatDate(status.fiscalYear.startsOn)} to {formatDate(status.fiscalYear.endsOn)})
        </p>
        <h2 id="setup-title" className="mt-0.5 text-xl font-bold leading-7 text-ink">
          {fy} setup
        </h2>
        <p className="mt-0.5 max-w-[70ch] text-[15px] leading-[22px] text-ink-2">
          Get {fy} initiatives and report forms ready before Mid-Year reporting opens{status.midYear ? ` ${formatDate(nextDay(status.midYear.endsOn))}` : ""}. {done} of 4 setup tasks complete.
        </p>
      </div>
      <ol className="divide-y divide-line-soft">
        {tasks.map((task, i) => (
          <li key={task.title} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1 basis-72">
              <h3 className="text-[17px] font-bold leading-6 text-ink">
                <span className="num mr-2 text-muted">{i + 1}.</span>
                {task.title}
              </h3>
              <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">{task.meta}</p>
              {task.link ? (
                <Link href={task.link.href} className="mt-1 inline-block text-[15px] font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                  {task.link.label}
                </Link>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {task.primary ? (
                <Link href={task.primary.href} className={buttonClass("primary", "md", "h-11 px-5 text-base")}>
                  {task.primary.label}
                </Link>
              ) : null}
              <strong className={cn("inline-flex rounded-sm px-2 py-0.5 text-[13px] font-semibold ring-1 ring-inset", TONE[task.tone])}>{task.status}</strong>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
