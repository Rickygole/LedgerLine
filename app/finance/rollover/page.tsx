import type { Metadata } from "next";
import { ArrowRight, CalendarRange, Landmark, Layers, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { formatCompactCurrency, plural } from "@/lib/format";
import { one, type SearchParams } from "@/lib/finance/admin/params";
import { fiscalYears, nextFiscalYear, validFiscalYear, yearSummary } from "@/lib/lifecycle/rollover";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Label, Select, Hint } from "@/components/ui/field";
import { CHECKLIST, checklistDone, loadDecisions, reviewForYear } from "@/lib/ops/reviews";
import { Badge } from "@/components/ui/status-badge";
import { RolloverSteps } from "@/components/finance/lifecycle/rollover-steps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Annual rollover" };

export default async function RolloverPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireUser(["finance_admin"]);
  const params = await searchParams;
  const { years, from, to, summary, targetSummary, review, decisions } = await withClaims(admin.id, async (tx) => {
    const years = await fiscalYears(tx);
    const requested = one(params, "from");
    const from = years.includes(requested) ? requested : (years[years.length - 1] ?? "");
    const requestedTo = one(params, "to").toUpperCase();
    const to = validFiscalYear(requestedTo) ? requestedTo : nextFiscalYear(from);
    const review = await reviewForYear(tx, from);
    return {
      years,
      from,
      to,
      summary: await yearSummary(tx, from),
      targetSummary: years.includes(to) ? await yearSummary(tx, to) : null,
      review,
      decisions: review ? await loadDecisions(tx, review.id) : [],
    };
  });
  const invalid = !validFiscalYear(to) || Number(to.slice(2)) <= Number(from.slice(2));
  const planHref = `/finance/rollover/plan?from=${from}&to=${to}`;

  return (
    <>
      <PageHeader
        title="Annual rollover"
        description="Start a new fiscal year from the current one. Initiatives, their funded organizations and their published report forms carry forward, and the history stays linked."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Annual rollover" }]}
        actions={
          <ButtonLink href="/finance/rollover/lineage" variant="secondary">
            View lineage
          </ButtonLink>
        }
      />
      <RolloverSteps current={1} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Choose the source year" />
          <CardBody>
            <form action="/finance/rollover" className="space-y-4">
              <div>
                <Label htmlFor="from">Roll over from</Label>
                <Select id="from" name="from" defaultValue={from}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="to">Roll over to</Label>
                <Hint id="to-hint">Enter FY and two digits, for example FY28. The year and its two reporting periods are created if they do not exist.</Hint>
                <Input id="to" name="to" defaultValue={to} pattern="FY[0-9]{2}" maxLength={4} aria-describedby="to-hint" />
              </div>
              <Button type="submit" variant="secondary">
                Show this year
              </Button>
            </form>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={`${from} structure review`}
              description="The annual review decides what to keep, rename, combine or retire before this rollover."
              actions={review ? review.status === "signed_off" ? <Badge tone="ok">Signed off {formatDate(review.signed_off_on)}</Badge> : <Badge tone="warn">In progress</Badge> : <Badge>Not started</Badge>}
            />
            <CardBody className="space-y-3 text-sm">
              {review ? (
                <>
                  <p>
                    {checklistDone(review)} of {CHECKLIST.length} checklist items ticked, {review.participants} {plural(review.participants, "participant", "participants")}, {review.decisions} {plural(review.decisions, "decision", "decisions")}.
                  </p>
                  {decisions.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {decisions.slice(0, 5).map((d) => (
                        <li key={d.id}>{d.decision}</li>
                      ))}
                    </ul>
                  ) : null}
                  {review.status !== "signed_off" ? <p className="font-semibold text-warn">The review is not signed off yet.</p> : null}
                </>
              ) : (
                <p className="font-semibold text-warn">No structure review has been started for {from}.</p>
              )}
              <ButtonLink href={review ? `/finance/reviews/${from}` : "/finance/reviews"} variant="secondary" size="sm">
                {review ? "Open the review" : "Start the review"}
              </ButtonLink>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`${from} at a glance`} description={`What will be offered for carry forward into ${to || "the new year"}.`} />
            <CardBody>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Stat label="Initiatives" value={summary.initiatives} icon={Layers} hint={`Active in ${from}`} />
                <Stat label="Organizations" value={summary.organizations} icon={Users} hint="With at least one award" />
                <Stat label="Awards" value={summary.assignments} icon={CalendarRange} hint="One per organization and initiative" />
                <Stat label="Funding" value={formatCompactCurrency(summary.totalFunding)} icon={Landmark} hint={`Total awarded in ${from}`} />
              </div>
              {targetSummary && targetSummary.initiatives > 0 ? (
                <p className="mt-4 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
                  {to} already has {targetSummary.initiatives} active initiatives. Initiatives that were already rolled over will be skipped.
                </p>
              ) : null}
              {invalid ? <p className="mt-4 text-sm font-semibold text-bad">The new year must look like FY28 and come after {from}.</p> : null}
              <div className="mt-5 flex justify-end">
                {invalid ? (
                  <Button disabled>
                    Review initiatives <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <ButtonLink href={planHref}>
                    Review initiatives <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </ButtonLink>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
