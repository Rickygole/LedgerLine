import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { systemToday } from "@/lib/ops/today";
import { CHECKLIST, DECISION_AREAS, loadDecisions, loadParticipants, reviewForYear, signOffBlockers } from "@/lib/ops/reviews";
import { ActionForm } from "@/components/ops/action-form";
import { addReviewDecision, addReviewParticipant, setReviewCheck, signOffReview } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Annual structure review" };

export default async function ReviewPage({ params }: { params: Promise<{ year: string }> }) {
  const admin = await requireUser(["finance_admin"]);
  const { year } = await params;
  if (!/^FY\d{2}$/.test(year)) notFound();
  const data = await withClaims(admin.id, async (tx) => {
    const review = await reviewForYear(tx, year);
    if (!review) return null;
    return { review, participants: await loadParticipants(tx, review.id), decisions: await loadDecisions(tx, review.id) };
  });
  if (!data) notFound();
  const { review, participants, decisions } = data;
  const signed = review.status === "signed_off";
  const blockers = signOffBlockers(review);
  const checks: Record<string, boolean> = {
    initiatives: review.check_initiatives,
    forms: review.check_forms,
    periods: review.check_periods,
    users: review.check_users,
    rules: review.check_rules,
  };
  const areaLabel = (value: string) => DECISION_AREAS.find((a) => a.value === value)?.label ?? value;

  return (
    <>
      <PageHeader
        title={`${year} structure review`}
        description={`Review held ${formatDate(review.review_date)}.`}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Annual structure review", href: "/finance/reviews" }, { label: year }]}
        meta={signed ? <Badge tone="ok">Signed off {formatDate(review.signed_off_on)} by {review.signed_off_by_name}</Badge> : <Badge tone="warn">In progress</Badge>}
        actions={
          <ButtonLink href={`/finance/rollover?from=${year}`} variant="secondary">
            Open annual rollover
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Checklist" />
          <CardBody>
            <ul className="divide-y divide-line border-y border-line">
              {CHECKLIST.map((item) => (
                <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-bold">{item.label}</p>
                    <p className="text-sm text-muted">{item.detail}</p>
                  </div>
                  {signed ? (
                    <Badge tone={checks[item.key] ? "ok" : "neutral"}>{checks[item.key] ? "Reviewed" : "Not reviewed"}</Badge>
                  ) : (
                    <ActionForm
                      action={setReviewCheck}
                      hidden={{ reviewId: review.id, item: item.key, year, done: checks[item.key] ? "false" : "true" }}
                      submitLabel={checks[item.key] ? `Untick ${item.label}` : `Tick ${item.label}`}
                      variant={checks[item.key] ? "secondary" : "primary"}
                      size="sm"
                      resetOnSuccess={false}
                      className="space-y-1"
                    />
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Participants" />
          <CardBody className="space-y-4">
            {participants.length === 0 ? <p className="text-sm text-muted">No participants recorded.</p> : null}
            <ul className="divide-y divide-line border-y border-line">
              {participants.map((p) => (
                <li key={p.id} className="py-2 text-sm">
                  <span className="font-semibold">{p.full_name}</span> <span className="text-muted">{p.affiliation}</span>
                </li>
              ))}
            </ul>
            {!signed ? (
              <ActionForm action={addReviewParticipant} hidden={{ reviewId: review.id, year }} submitLabel="Add participant" pendingLabel="Adding" variant="secondary">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" aria-required="true" name="name" maxLength={120} />
                  </div>
                  <div>
                    <Label htmlFor="affiliation">Organization or team</Label>
                    <Input id="affiliation" aria-required="true" name="affiliation" maxLength={160} />
                  </div>
                </div>
              </ActionForm>
            ) : null}
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Decisions" description="Changes agreed for the next fiscal year. Record No change when an area stays as it is." />
        <CardBody className="space-y-4">
          {decisions.length === 0 ? <p className="text-sm text-muted">No decisions recorded.</p> : null}
          <ul className="divide-y divide-line border-y border-line">
            {decisions.map((d) => (
              <li key={d.id} className="py-2.5 text-sm">
                <Badge>{areaLabel(d.area)}</Badge> <span className="ml-1">{d.decision}</span>
                <span className="ml-2 text-muted">{d.decided_by_name}</span>
              </li>
            ))}
          </ul>
          {!signed ? (
            <ActionForm action={addReviewDecision} hidden={{ reviewId: review.id, year }} submitLabel="Record decision" pendingLabel="Recording" variant="secondary">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
                <div>
                  <Label htmlFor="area">Area</Label>
                  <Select id="area" aria-required="true" name="area" defaultValue="">
                    <option value="" disabled>
                      Choose one
                    </option>
                    {DECISION_AREAS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="decision">Decision</Label>
                  <Textarea id="decision" aria-required="true" name="decision" rows={2} maxLength={1000} />
                </div>
              </div>
            </ActionForm>
          ) : null}
        </CardBody>
      </Card>
      {!signed ? (
        <Card className="mt-6">
          <CardHeader title="Sign off" description="A Finance administrator signs off once the checklist is complete, participants are recorded and decisions are made. A signed review cannot be changed." />
          <CardBody>
            {blockers.length > 0 ? (
              <ul className="mb-4 list-disc pl-5 text-sm text-muted">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            <ActionForm action={signOffReview} hidden={{ reviewId: review.id, year }} submitLabel="Sign off review" pendingLabel="Signing off" resetOnSuccess={false}>
              <div className="max-w-xs">
                <Label htmlFor="signedOn">
                  Sign-off date
                </Label>
                <Input id="signedOn" aria-required="true" name="signedOn" type="date" defaultValue={systemToday()} />
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
