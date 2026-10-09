import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Eye, Flag, RotateCcw, Send } from "lucide-react";
import { ActivityFeed, type ActivityItem } from "@/components/finance/review/activity-feed";
import { NeedsAttention, type AttentionItem } from "@/components/finance/review/needs-attention";
import { PeriodSelect } from "@/components/finance/review/period-select";
import { StatusStackChart, type StackDatum } from "@/components/charts/status-stack";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { daysBetween, formatDate, todayInNewYork } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { countBuckets, groupBy } from "@/lib/finance/review/derive";
import { hrefWith, parseFilters } from "@/lib/finance/review/filters";
import { QUIET_ACTIONS } from "@/lib/finance/review/audit-words";
import { auditEntityHref, auditPhrase, recentActivity } from "@/lib/finance/admin/audit";
import type { Filters, ReportRow } from "@/lib/finance/review/types";
import { formatCompactCurrency } from "@/lib/rules/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FinanceDashboard({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(FINANCE_ROLES);
  const raw = await searchParams;

  const data = await withClaims(user.id, async (tx) => {
    const periods = await loadPeriods(tx);
    const filters = parseFilters(raw, periods);
    const period = periods.find((p) => p.id === filters.period)!;
    const rows = await loadReportRows(tx, period);
    const activity = await recentActivity(tx, QUIET_ACTIONS);
    return { periods, period, rows, activity };
  });

  const { periods, period, rows } = data;
  const counts = countBuckets(rows);
  const awarded = rows.reduce((sum, row) => sum + row.award, 0);
  const initiativeCount = new Set(rows.map((row) => row.initiativeId)).size;
  const flagged = rows.filter((row) => row.flags.length > 0).length;
  const untilDue = daysBetween(todayInNewYork(), period.dueOn);
  const pct = (n: number) => (rows.length === 0 ? "0%" : `${Math.round((n / rows.length) * 100)}%`);

  const overdue = rows
    .filter((row) => (row.status === null || row.status === "draft") && row.daysPastDue > 0)
    .sort((a, b) => b.daysPastDue - a.daysPastDue || b.award - a.award)
    .slice(0, 4);

  const activity: ActivityItem[] = data.activity.map((a) => {
    const phrase = auditPhrase(a);
    const href = a.entity === "app_user" && user.role !== "finance_admin" ? null : auditEntityHref(a);
    return { id: a.id, at: new Date(a.at).toISOString(), actor: phrase.actor, verb: phrase.verb, subject: phrase.subject, href, initiative: a.initiative_name, ai: Boolean(a.ai_action_id) };
  });

  const base = { period: period.id };
  const list = (extra: Partial<Filters>) => hrefWith("/finance/submissions", base, extra);
  const stack = (key: (row: ReportRow) => string, param: "category" | "borough"): StackDatum[] =>
    [...groupBy(rows, key).entries()].map(([name, group]) => ({ name, href: list({ [param]: name }), ...countBuckets(group) }));

  const attention: AttentionItem[] = [
    { label: "Missing", detail: "Past due with nothing submitted", count: counts.missing, href: list({ bucket: "missing" }), tone: "bad", icon: AlertTriangle },
    { label: "Waiting for review", detail: "Submitted, review not started", count: counts.submitted, href: list({ bucket: "submitted" }), tone: "info", icon: Send },
    { label: "Flagged", detail: "At least one open finding", count: flagged, href: hrefWith("/finance/flagged", base, {}), tone: "warn", icon: Flag },
    { label: "Update requested", detail: "Waiting on the organization", count: counts.returned, href: list({ bucket: "returned" }), tone: "warn", icon: RotateCcw },
  ];

  const due = untilDue < 0 ? `${Math.abs(untilDue)} ${Math.abs(untilDue) === 1 ? "day" : "days"} past due` : untilDue === 0 ? "due today" : `due in ${untilDue} ${untilDue === 1 ? "day" : "days"}`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${period.label} reports ${untilDue < 0 ? "were" : "are"} due ${formatDate(period.dueOn)}, ${due}.`}
        meta={
          <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted">
            <li>
              <span className="num font-semibold text-ink">{initiativeCount}</span> {initiativeCount === 1 ? "initiative" : "initiatives"} in {period.fiscalYearId}
            </li>
            <li className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
            <li>
              <span className="num font-semibold text-ink">{formatCompactCurrency(awarded)}</span> awarded across <span className="num">{rows.length}</span> awards
            </li>
          </ul>
        }
        actions={<PeriodSelect periods={periods} value={period.id} />}
      />

      <section aria-label="Key figures" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Reports due" value={rows.length} icon={CalendarClock} tone="info" hint={period.label} href={list({})} />
        <Stat label="Accepted" value={counts.accepted} icon={CheckCircle2} tone="ok" hint={`${pct(counts.accepted)} of reports due`} href={list({ bucket: "accepted" })} />
        <Stat label="In review" value={counts.in_review} icon={Eye} tone="neutral" hint={`${counts.submitted} more waiting to start`} href={list({ bucket: "in_review" })} />
        <Stat label="Missing" value={counts.missing} icon={AlertTriangle} tone="bad" hint="Past due, nothing submitted" href={list({ bucket: "missing" })} />
      </section>

      <section aria-label="Status and attention" className="mb-6 grid gap-4 xl:grid-cols-12">
        <StatusStackChart
          title="Report status by category"
          description={`Where each ${period.label} report stands, by initiative category.`}
          dimension="Category"
          data={stack((row) => row.category, "category")}
          periodLabel={period.label}
          className="xl:col-span-8"
        />
        <div className="min-w-0 xl:col-span-4">
          <NeedsAttention items={attention} overdue={overdue} overdueHref={list({ bucket: "missing" })} />
        </div>
      </section>

      <section aria-label="Borough and activity" className="grid gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <StatusStackChart
            title="Report status by borough"
            description="The same reports, grouped by where the organization is based."
            dimension="Borough"
            data={stack((row) => row.borough, "borough")}
            periodLabel={period.label}
          />
        </div>
        <Card className="xl:col-span-4">
          <CardHeader title="Recent activity" description="Latest actions across all reports." />
          <ActivityFeed items={activity} />
          <CardBody className="border-t border-line py-3 text-sm">
            <Link href="/finance/audit" className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
              Open the full audit log
            </Link>
          </CardBody>
        </Card>
      </section>
    </>
  );
}
