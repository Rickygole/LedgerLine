import type { Metadata } from "next";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DueBadge, StateBadge } from "@/components/ui/status-badge";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Segmented } from "@/components/portal/portal-filters";
import { OrgSummary } from "@/components/portal/org-summary";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatCurrency } from "@/lib/rules/money";
import { actionFor, loadObligations, loadOrganization } from "@/lib/portal/data";

export const metadata: Metadata = { title: "My reports" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requireUser(["cbo_submitter"]);
  const params = await searchParams;
  const { org, obligations } = await withClaims(user.id, async (tx) => ({
    org: await loadOrganization(tx, user.orgId!),
    obligations: await loadObligations(tx, user.orgId!),
  }));
  const periods = Array.from(new Map(obligations.map((o) => [o.periodId, o.periodLabel])).entries());
  const period = periods.some(([id]) => id === params.period) ? params.period! : "all";
  const rows = period === "all" ? obligations : obligations.filter((o) => o.periodId === period);
  const urgent = obligations.filter((o) => o.needsAction);
  const awards = new Map(obligations.map((o) => [o.assignmentId, o.award]));
  const totalAwarded = Array.from(awards.values()).reduce((sum, v) => sum + v, 0);

  return (
    <>
      <PageHeader
        title="My reports"
        description={`Welcome, ${user.fullName.split(" ")[0]}. These are the reports ${user.orgName ?? "your organization"} owes the City Council, one row per initiative and reporting period.`}
        crumbs={[{ label: "Portal" }, { label: "My reports" }]}
      />
      {org ? <OrgSummary org={org} activeAwards={awards.size} totalAwarded={totalAwarded} /> : null}

      {urgent.length > 0 ? (
        <section aria-labelledby="action-needed" className="mb-6 rounded-lg border border-bad/30 bg-bad-bg px-5 py-4">
          <h2 id="action-needed" className="flex items-center gap-2 text-base font-semibold text-bad">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Action needed
          </h2>
          <ul className="mt-3 space-y-2">
            {urgent.map((o) => {
              const action = actionFor(o);
              return (
                <li key={`${o.assignmentId}-${o.periodId}`} className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink">
                  <span>
                    <span className="font-semibold">{o.initiativeName}</span>, {o.periodLabel}:{" "}
                    {o.state === "returned" ? "Finance asked for changes." : `due ${formatDate(o.dueOn)}, now ${o.pastDue} ${o.pastDue === 1 ? "day" : "days"} past due.`}
                  </span>
                  <ButtonLink href={action.href} size="sm" variant="danger">
                    {action.label}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </ButtonLink>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardHeader
          title="Reporting obligations"
          description="Overdue reports and requested changes are listed first."
          actions={
            <Segmented
              label="Filter by reporting period"
              param="period"
              base={{}}
              current={period}
              options={[{ value: "all", label: "All periods", count: obligations.length }, ...periods.map(([id, label]) => ({ value: id, label, count: obligations.filter((o) => o.periodId === id).length }))]}
            />
          }
        />
        <Table>
          <THead>
            <tr>
              <TH>Initiative</TH>
              <TH>Period</TH>
              <TH>Due</TH>
              <TH align="right">Award</TH>
              <TH>Status</TH>
              <TH>Last edited</TH>
              <TH>
                <span className="sr-only">Action</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={7}>No reporting obligations for this period. Council Finance assigns initiatives to your organization.</EmptyRow>
            ) : (
              rows.map((o) => {
                const action = actionFor(o);
                return (
                  <TR key={`${o.assignmentId}-${o.periodId}`} className={o.needsAction ? "bg-bad-bg/30" : undefined}>
                    <TD>
                      <p className="font-medium text-ink">{o.initiativeName}</p>
                      <p className="num text-xs text-muted">{o.initiativeCode}{o.referenceNo ? `, ${o.referenceNo}` : ""}</p>
                    </TD>
                    <TD>
                      <p>{o.periodLabel}</p>
                      <p className="text-xs text-muted">{formatDate(o.startsOn)} to {formatDate(o.endsOn)}</p>
                    </TD>
                    <TD>
                      <p className="whitespace-nowrap">{formatDate(o.dueOn)}</p>
                      {o.status === null || o.status === "draft" || o.status === "returned" ? <DueBadge daysPastDue={o.pastDue} /> : null}
                    </TD>
                    <TD align="right">{formatCurrency(o.award)}</TD>
                    <TD>
                      <StateBadge state={o.state} audience="cbo" />
                    </TD>
                    <TD>
                      {o.editedAt && o.submissionId ? (
                        <>
                          <p>{o.editedBy ?? "Unknown"}</p>
                          <p className="text-xs text-muted">{formatDateTime(o.editedAt)}</p>
                        </>
                      ) : (
                        <span className="text-muted">Not started</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <ButtonLink href={action.href} variant={action.primary ? "primary" : "secondary"} size="sm">
                        {action.label}
                      </ButtonLink>
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
        <CardBody className="border-t border-line text-xs text-muted">Dates and times are shown in Eastern Time.</CardBody>
      </Card>
    </>
  );
}
