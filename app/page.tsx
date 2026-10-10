import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PlainFrame } from "@/components/shell/plain-frame";
import { ButtonLink } from "@/components/ui/button";
import { FiscalYearTimeline, marksFromCalendar } from "@/components/ui/fiscal-year-timeline";
import { Badge } from "@/components/ui/status-badge";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { loadFiscalCalendar, type CalendarPeriod } from "@/lib/calendar";
import { formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const metadata: Metadata = { title: { absolute: "Report on your City Council initiative funding | LedgerLine" } };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string) {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function covers(period: CalendarPeriod) {
  const sameYear = period.startsOn.slice(0, 4) === period.endsOn.slice(0, 4);
  return sameYear ? `Covers ${shortDate(period.startsOn)} to ${formatDate(period.endsOn)}` : `Covers ${formatDate(period.startsOn)} to ${formatDate(period.endsOn)}`;
}

function fiscalYearName(id: string) {
  const digits = id.replace(/\D/g, "");
  return digits ? `Fiscal Year 20${digits.slice(-2)}` : id;
}

const linkClass = "text-link underline underline-offset-2 hover:text-link-hover hover:decoration-2";

export default async function StartPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect(homeFor(user.role));

  const calendar = await loadFiscalCalendar();
  const { today, fiscalYear, periods } = calendar;
  const upcoming = periods.find((p) => p.endsOn >= today);

  return (
    <PlainFrame tone="white" wide>
      <div className="border-b border-line-soft bg-harbor-50 py-12 sm:py-14">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-8">
          <p className="eyebrow mb-2">New York City Council discretionary funding</p>
          <h1 className="max-w-[760px] text-[32px] font-extrabold leading-10 tracking-[-0.015em] text-ink sm:text-[44px] sm:leading-[52px]">Report on your City Council initiative funding</h1>
          <p className="mt-4 max-w-[720px] text-lg leading-7 text-ink sm:text-xl sm:leading-[30px]">
            File mid-year and year-end reports for programs funded through City Council initiatives, see what your organization still owes, and answer requests from Council Finance.
          </p>
          <ButtonLink href="/login" size="lg" className="mt-7">
            Start now
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </ButtonLink>
          <p className="mt-3.5 text-[15px] leading-[22px] text-ink-2">
            Already started a report?{" "}
            <Link href="/login" className={linkClass}>
              Sign in
            </Link>{" "}
            to continue where you left off.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-4 sm:px-8">
        <section aria-labelledby="calendar-title" className="pt-10 sm:pt-11">
          <h2 id="calendar-title" className="text-2xl font-bold leading-8 text-ink">
            {fiscalYearName(fiscalYear.id)} reporting calendar
          </h2>
          <p className="mt-1 text-[15px] leading-[22px] text-muted">
            New York City fiscal years run July 1 to June 30. {fiscalYear.id} runs {formatDate(fiscalYear.startsOn)} to {formatDate(fiscalYear.endsOn)}.
          </p>
          <FiscalYearTimeline
            className="mt-6"
            fiscalYear={fiscalYear.id}
            startsOn={fiscalYear.startsOn}
            endsOn={fiscalYear.endsOn}
            today={today}
            marks={marksFromCalendar(calendar)}
            label={`${fiscalYear.id} reporting calendar`}
          />
        </section>

        <div className="grid gap-12 py-11 md:grid-cols-[2fr_1fr] md:gap-14">
          <div className="min-w-0 text-[17px] leading-[27px] text-ink">
            <h2 className="text-2xl font-bold leading-8">Use this service if</h2>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>your organization receives discretionary funding through one or more City Council initiatives</li>
              <li>you prepare or submit reports on that funding for your organization</li>
            </ul>

            <h2 className="mt-9 text-2xl font-bold leading-8">Before you start, have ready</h2>
            <ul className="mt-3 list-disc space-y-1 pl-6">
              <li>your organization&apos;s EIN (nine digits, for example 13-4027118)</li>
              <li>program results for the reporting period, such as participants served</li>
              <li>spending by budget line, split into personal services (PS) and other than personal services (OTPS)</li>
              <li>supporting documents: PDF, Word, Excel or CSV, up to 25 MB each</li>
            </ul>

            <h2 className="mt-9 text-2xl font-bold leading-8">What happens after you submit</h2>
            <p className="mt-3 max-w-[70ch]">
              You get a reference number that starts with LL-, and a copy of what you submitted is saved in Messages. Council Finance reviews each report. If anything needs to change, Council Finance tells you what and reopens the report for you.
            </p>

            <p className="mt-8 text-base leading-6">
              Council Finance staff:{" "}
              <Link href="/login" className={linkClass}>
                sign in to the Finance workspace
              </Link>
              .
            </p>
          </div>

          <aside aria-labelledby="key-dates" className="self-start border-t-4 border-action pt-4">
            <h2 id="key-dates" className="text-lg font-bold leading-7 text-ink">
              Key dates
            </h2>
            <ul className="mt-1 divide-y divide-line-soft">
              {periods.map((period) => {
                const passed = period.dueOn < today;
                const open = !passed && period.endsOn < today;
                const next = period === upcoming;
                return (
                  <li key={period.id} className="py-3">
                    <p className="text-[17px] font-bold leading-6 text-ink">{period.label} report</p>
                    <p className="text-sm leading-[22px] text-muted">{covers(period)}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-[22px] text-muted">
                      <span>{passed ? `Was due ${formatDate(period.dueOn)}` : `Due ${formatDate(period.dueOn)}`}</span>
                      {passed ? <Badge tone="bad">Past due</Badge> : open ? <Badge tone="ok">Open now</Badge> : next ? <Badge tone="info">Opens {shortDate(nextDay(period.endsOn))}</Badge> : null}
                    </p>
                  </li>
                );
              })}
            </ul>

            <h2 className="mt-7 text-lg font-bold leading-7 text-ink">Get help</h2>
            <p className="mt-1 text-[15px] leading-[23px] text-ink">
              Council Finance support
              <br />
              Monday to Friday, 9 AM to 5 PM ET
              <br />
              <Link href="/help#contact" className={linkClass}>
                Contact support
              </Link>
            </p>
          </aside>
        </div>
      </div>
    </PlainFrame>
  );
}
