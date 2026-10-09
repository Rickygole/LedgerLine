import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Flag, Landmark, Layers } from "lucide-react";
import { ActivityFeed, type ActivityItem } from "@/components/finance/review/activity-feed";
import { BucketCards } from "@/components/finance/review/bucket-cards";
import { DueSoonList } from "@/components/finance/review/due-soon";
import { PeriodSelect } from "@/components/finance/review/period-select";
import { CompletionByCategoryChart } from "@/components/charts/completion-by-category";
import { StatusByBoroughChart } from "@/components/charts/status-by-borough";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { daysBetween, formatDate, todayInNewYork } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { loadPeriods, loadReportRows } from "@/lib/finance/review/data";
import { boroughSeries, completionByCategory, countBuckets, isSubmittedStatus } from "@/lib/finance/review/derive";
import { hrefWith, parseFilters } from "@/lib/finance/review/filters";
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
    const filters = parseFilters(raw, periods.map((p) => p.id));
    const period = periods.find((p) => p.id === filters.period)!;
    const rows = await loadReportRows(tx, period);
    const initiatives = await tx.one<{ n: string }>("SELECT count(*)::text AS n FROM initiative WHERE status = 'active'");
    const activity = await tx.query<{
      id: string;
      at: string;
      actor: string | null;
      action: string;
      entity: string;
      submission_id: string | null;
      reference_no: string | null;
      initiative: string | null;
      ai: boolean;
    }>(
      `SELECT e.id::text AS id, to_char(e.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, u.full_name AS actor, e.action, e.entity,
              s.id AS submission_id, s.reference_no, i.name AS initiative, (e.ai_action_id IS NOT NULL) AS ai
       FROM audit_event e
       LEFT JOIN app_user u ON u.id = e.actor_id
       LEFT JOIN submission s ON e.entity = 'submission' AND s.id::text = e.entity_id
       LEFT JOIN assignment a ON a.id = s.assignment_id
       LEFT JOIN initiative i ON i.id = a.initiative_id
       ORDER BY e.id DESC LIMIT 10`
    );
    return { periods, period, rows, initiatives: Number(initiatives?.n ?? 0), activity };
  });

  const { periods, period, rows } = data;
  const counts = countBuckets(rows);
  const awarded = rows.reduce((sum, row) => sum + row.award, 0);
  const submitted = rows.filter((row) => isSubmittedStatus(row.status)).length;
  const flagged = rows.filter((row) => row.flags.length > 0).length;
  const percent = rows.length === 0 ? 0 : Math.round((submitted / rows.length) * 1000) / 10;
  const untilDue = daysBetween(todayInNewYork(), period.dueOn);

  const waiting = rows
    .filter((row) => row.status === null || row.status === "draft" || row.status === "returned")
    .sort((a, b) => b.daysPastDue - a.daysPastDue || b.award - a.award)
    .slice(0, 8);

  const activity: ActivityItem[] = data.activity.map((a) => ({
    id: Number(a.id),
    at: a.at,
    actor: a.actor,
    action: a.action,
    entity: a.entity,
    submissionId: a.submission_id,
    referenceNo: a.reference_no,
    initiative: a.initiative,
    ai: a.ai,
  }));

  const filterBase = { period: period.id };

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${period.label}: due ${formatDate(period.dueOn)}${untilDue < 0 ? `, ${Math.abs(untilDue)} ${Math.abs(untilDue) === 1 ? "day" : "days"} past due` : `, in ${untilDue} ${untilDue === 1 ? "day" : "days"}`}.`}
        actions={<PeriodSelect periods={periods} value={period.id} />}
      />

      <section aria-label="Key figures" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Active initiatives" value={data.initiatives} icon={Layers} href="/finance/initiatives" hint="Across all fiscal years" />
        <Stat label="Total awarded" value={formatCompactCurrency(awarded)} icon={Landmark} hint={`${rows.length} awards`} />
        <Stat label="Reports due" value={rows.length} icon={CalendarClock} hint={`For ${period.label}`} href={hrefWith("/finance/submissions", filterBase, {})} />
        <Stat label="Percent submitted" value={`${percent}%`} icon={CheckCircle2} tone="ok" hint={`${submitted} of ${rows.length} reports`} />
        <Stat label="Missing" value={counts.missing} icon={AlertTriangle} tone="bad" hint="Not submitted, past due" href={hrefWith("/finance/submissions", filterBase, { bucket: "missing" })} />
        <Stat label="Flagged items" value={flagged} icon={Flag} tone="warn" hint="Reports needing a look" href={hrefWith("/finance/flagged", filterBase, {})} />
      </section>

      <section aria-labelledby="buckets-heading" className="mb-8">
        <h2 id="buckets-heading" className="mb-3 text-base font-semibold text-ink">
          Reports by bucket
        </h2>
        <BucketCards counts={counts} period={period.id} total={rows.length} />
      </section>

      <section aria-label="Charts" className="mb-8 grid gap-4 xl:grid-cols-2">
        <StatusByBoroughChart data={boroughSeries(rows)} periodLabel={period.label} />
        <CompletionByCategoryChart data={completionByCategory(rows)} periodLabel={period.label} />
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title={untilDue < 0 ? "Overdue" : "Due soon"}
            description="Organizations that still owe a report, longest wait first."
            actions={
              <ButtonLink href={hrefWith("/finance/submissions", filterBase, { bucket: untilDue < 0 ? "missing" : "outstanding" })} variant="secondary" size="sm">
                View all
              </ButtonLink>
            }
          />
          <DueSoonList rows={waiting} />
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Recent activity" description="Latest actions across all reports." />
          <ActivityFeed items={activity} />
          <CardBody className="border-t border-line py-3 text-sm">
            <Link href="/finance/audit" className="font-semibold text-navy-700 hover:underline">
              Open the full audit log
            </Link>
          </CardBody>
        </Card>
      </section>
    </>
  );
}
