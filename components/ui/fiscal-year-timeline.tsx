import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/dates";

export type TimelineMark = {
  date: Date | string;
  label: string;
  kind: "boundary" | "period-end" | "due";
  state?: "past" | "current";
};

type CalendarLike = {
  fiscalYear: { id: string; startsOn: string; endsOn: string };
  periods: { label: string; endsOn: string; dueOn: string; fiscalYearId: string }[];
};

const DAY = 86_400_000;

function toIso(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function utc(isoDate: string): number {
  return Date.UTC(Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function longDate(isoDate: string): string {
  return `${MONTHS[Number(isoDate.slice(5, 7)) - 1]} ${Number(isoDate.slice(8, 10))}, ${isoDate.slice(0, 4)}`;
}

function yearBounds(fiscalYear: string): { startsOn: string; endsOn: string } {
  const end = 2000 + Number(fiscalYear.replace(/\D/g, "").slice(-2));
  return { startsOn: `${end - 1}-07-01`, endsOn: `${end}-06-30` };
}

export function marksFromCalendar(calendar: CalendarLike, options: { dueOnly?: boolean } = {}): TimelineMark[] {
  const { id, startsOn, endsOn } = calendar.fiscalYear;
  const inside = (d: string) => d >= startsOn && d <= endsOn;
  const marks: TimelineMark[] = [];
  if (!options.dueOnly) marks.push({ date: startsOn, label: `${id} begins`, kind: "boundary" });
  for (const period of calendar.periods) {
    if (!options.dueOnly && period.fiscalYearId === id && period.endsOn !== endsOn && inside(period.endsOn)) {
      marks.push({
        date: period.endsOn,
        label: `${period.label.replace(`${id} `, "")} period ends`,
        kind: "period-end",
      });
    }
    if (inside(period.dueOn)) marks.push({ date: period.dueOn, label: `${period.label} due`, kind: "due" });
  }
  if (!options.dueOnly) marks.push({ date: endsOn, label: `${id} ends`, kind: "boundary" });
  return marks.sort((a, b) => toIso(a.date).localeCompare(toIso(b.date)));
}

export function FiscalYearTimeline({
  fiscalYear,
  today,
  marks,
  startsOn,
  endsOn,
  variant = "full",
  className,
  label,
}: {
  fiscalYear: string;
  today: Date | string;
  marks: TimelineMark[];
  startsOn?: string;
  endsOn?: string;
  variant?: "full" | "compact";
  className?: string;
  label?: string;
}) {
  const bounds = startsOn && endsOn ? { startsOn, endsOn } : yearBounds(fiscalYear);
  const start = utc(bounds.startsOn);
  const span = Math.max(1, (utc(bounds.endsOn) - start) / DAY);
  const todayIso = toIso(today);
  const pct = (isoDate: string) => Math.max(0, Math.min(100, ((utc(isoDate) - start) / DAY / span) * 100));
  const todayPct = pct(todayIso);
  const showToday = todayIso >= bounds.startsOn && todayIso <= bounds.endsOn;

  const items = marks
    .map((mark) => {
      const iso = toIso(mark.date);
      const state = mark.state ?? (iso < todayIso ? "past" : undefined);
      return { ...mark, iso, state, at: pct(iso) };
    })
    .sort((a, b) => a.iso.localeCompare(b.iso));
  const nextIndex = items.findIndex((m) => m.iso >= todayIso && m.kind === "due");

  const captionClass = variant === "compact" ? "hidden lg:block" : "block";
  const name = label ?? `${fiscalYear} reporting calendar`;

  type Row = {
    key: string;
    iso: string;
    text: string;
    kind: TimelineMark["kind"] | "today";
    state?: string;
    next?: boolean;
  };
  const rows: Row[] = items.map((m, i) => ({
    key: `${m.iso}-${m.label}`,
    iso: m.iso,
    text: m.label,
    kind: m.kind,
    state: m.state,
    next: i === nextIndex,
  }));
  if (showToday) {
    const at = rows.findIndex((r) => r.iso > todayIso);
    rows.splice(at === -1 ? rows.length : at, 0, { key: "today", iso: todayIso, text: "Today", kind: "today" });
  }

  return (
    <div className={cn("@container", className)}>
      <ol aria-label={name} className="relative mx-2 hidden h-[124px] @min-[640px]:block">
        <li aria-hidden="true" className="absolute inset-x-0 top-[54px] h-1 rounded-sm bg-harbor-200" />
        {items.map((m) => {
          const above = m.kind === "period-end";
          const align = m.at < 8 ? "left" : m.at > 92 ? "right" : "center";
          const past = m.state === "past";
          const shift =
            align === "left"
              ? "translate-x-0 text-left"
              : align === "right"
                ? "-translate-x-full text-right"
                : "-translate-x-1/2 text-center";
          return (
            <li key={`${m.iso}-${m.label}`} className="absolute top-0 h-full" style={{ left: `${m.at}%` }}>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-[56px] -translate-x-1/2 -translate-y-1/2",
                  m.kind === "due"
                    ? past
                      ? "h-3.5 w-3.5 rounded-sm bg-harbor-300"
                      : "h-3.5 w-3.5 rounded-sm bg-action"
                    : cn(
                        "h-2.5 w-2.5 rounded-full border-2 bg-white",
                        past ? "border-harbor-300" : "border-harbor-600",
                      ),
                  align === "left" && "translate-x-0",
                  align === "right" && "-translate-x-full",
                )}
              />
              <span
                className={cn(
                  "absolute whitespace-nowrap text-[13px] leading-[17px]",
                  shift,
                  above ? "bottom-[84px]" : "top-[70px]",
                )}
              >
                <span className={cn("block font-bold", past ? "text-muted" : "text-ink")}>{longDate(m.iso)}</span>
                <span className={cn(captionClass, past ? "text-muted" : "text-ink-2")}>
                  {m.label}
                  {past ? <span className="sr-only"> (passed)</span> : null}
                </span>
              </span>
            </li>
          );
        })}
        {showToday ? (
          <li
            className="absolute top-[26px] h-[34px] border-l-2 border-dashed border-bad"
            style={{ left: `${todayPct}%` }}
          >
            <span className="absolute -top-[2px] left-1.5 whitespace-nowrap text-[13px] font-bold leading-[17px] text-bad">
              Today, {shortDate(todayIso)}
            </span>
          </li>
        ) : null}
      </ol>
      <ol aria-label={name} className="divide-y divide-line-soft border-y border-line-soft @min-[640px]:hidden">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-3 py-3">
            <span
              aria-hidden="true"
              className={cn(
                "mt-1.5 shrink-0",
                row.kind === "today"
                  ? "h-3 w-3 border-l-2 border-dashed border-bad"
                  : row.kind === "due"
                    ? cn("h-3 w-3 rounded-sm", row.state === "past" ? "bg-harbor-300" : "bg-action")
                    : cn(
                        "h-2.5 w-2.5 rounded-full border-2 bg-white",
                        row.state === "past" ? "border-harbor-300" : "border-harbor-600",
                      ),
              )}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-[15px] font-bold leading-[22px]",
                  row.kind === "today" ? "text-bad" : row.state === "past" ? "text-muted" : "text-ink",
                )}
              >
                {row.kind === "today" ? `Today, ${shortDate(row.iso)}` : longDate(row.iso)}
              </span>
              {row.kind === "today" ? null : (
                <span className={cn("block text-sm leading-5", row.state === "past" ? "text-muted" : "text-ink-2")}>
                  {row.text}
                </span>
              )}
            </span>
            {row.state === "past" ? (
              <span className="shrink-0 rounded-sm bg-white px-2 py-0.5 text-[13px] font-semibold leading-5 text-ink-2 ring-1 ring-inset ring-line-strong">
                Passed
              </span>
            ) : row.next ? (
              <span className="shrink-0 rounded-sm bg-info-bg px-2 py-0.5 text-[13px] font-semibold leading-5 text-info ring-1 ring-inset ring-info/20">
                Next due
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
