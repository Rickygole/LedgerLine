import { cn } from "@/lib/cn";
import { daysBetween, formatDate } from "@/lib/dates";

export type TimelineMark = { date: string; label: string; kind: "boundary" | "period-end" | "due"; detail?: string; tone?: "bad" | "ok" | "neutral" };

function short(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${iso}T12:00:00Z`));
}

export function FyTimeline({ startsOn, endsOn, today, marks }: { startsOn: string; endsOn: string; today: string; marks: TimelineMark[] }) {
  const span = Math.max(1, daysBetween(startsOn, endsOn));
  const at = (iso: string) => Math.min(100, Math.max(0, (daysBetween(startsOn, iso) / span) * 100));
  const sorted = [...marks].sort((a, b) => a.date.localeCompare(b.date));
  const showToday = today >= startsOn && today <= endsOn;
  const todayAt = at(today);

  return (
    <>
      <ol className="space-y-0 sm:hidden">
        {sorted.map((mark) => {
          const past = mark.date < today;
          return (
            <li key={`${mark.date}-${mark.label}`} className="flex gap-3 border-b border-[#e3e7ec] py-3 last:border-b-0">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 shrink-0",
                  mark.kind === "due" ? "h-3 w-3" : "h-2.5 w-2.5 rounded-full border-2",
                  mark.kind === "due" ? (past ? "bg-navy-300" : "bg-action") : past ? "border-navy-300 bg-white" : "border-navy-600 bg-white"
                )}
              />
              <div className="min-w-0">
                <p className={cn("text-[15px] font-bold", past ? "text-muted" : "text-ink")}>{formatDate(mark.date)}</p>
                <p className="text-[15px] text-[#3d4757]">{mark.label}</p>
                {mark.detail ? <p className={cn("text-sm font-semibold", mark.tone === "bad" ? "text-bad" : mark.tone === "ok" ? "text-ok" : "text-muted")}>{mark.detail}</p> : null}
              </div>
            </li>
          );
        })}
        {showToday ? <li className="pt-3 text-sm font-bold text-bad">Today is {formatDate(today)}.</li> : null}
      </ol>

      <div className="relative mx-12 hidden h-[148px] sm:block lg:mx-14" aria-hidden="true">
        <div className="absolute inset-x-0 top-[70px] h-1 rounded-sm bg-navy-200" />
        {showToday ? (
          <div className="absolute top-[34px] h-[52px] border-l-2 border-dashed border-bad" style={{ left: `${todayAt}%` }}>
            <span className="absolute -top-[22px] left-1.5 whitespace-nowrap text-[13px] font-bold text-bad">Today, {short(today)}</span>
          </div>
        ) : null}
        {sorted.map((mark) => {
          const left = at(mark.date);
          const past = mark.date < today;
          const above = mark.kind === "period-end";
          const align = left < 6 ? "left-0 -translate-x-1" : left > 94 ? "right-0 translate-x-1" : "left-1/2 -translate-x-1/2";
          return (
            <div key={`${mark.date}-${mark.label}`} className="absolute top-[72px]" style={{ left: `${left}%` }}>
              <span
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2",
                  mark.kind === "due" ? "h-3.5 w-3.5" : "h-2.5 w-2.5 rounded-full border-2",
                  mark.kind === "due" ? (past ? "bg-navy-300" : "bg-action") : past ? "border-navy-300 bg-white" : "border-navy-600 bg-white"
                )}
              />
              <div className={cn("absolute whitespace-nowrap text-center", align, above ? "bottom-[14px]" : "top-[14px]")}>
                <p className={cn("text-[13px] font-bold leading-[18px]", past ? "text-muted" : "text-ink")}>{formatDate(mark.date)}</p>
                <p className="text-[13px] leading-[18px] text-[#3d4757]">{mark.label}</p>
                {mark.detail ? <p className={cn("text-[13px] font-semibold leading-[18px]", mark.tone === "bad" ? "text-bad" : mark.tone === "ok" ? "text-ok" : "text-muted")}>{mark.detail}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="sr-only hidden sm:block">
        {sorted.map((mark) => (
          <li key={`${mark.date}-${mark.label}-sr`}>
            {formatDate(mark.date)}: {mark.label}
            {mark.detail ? `, ${mark.detail}` : ""}
          </li>
        ))}
        {showToday ? <li>Today is {formatDate(today)}.</li> : null}
      </ul>
    </>
  );
}
