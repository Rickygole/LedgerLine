import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { ActionsPanel, type CorrectableQuestion } from "@/components/finance/review/actions-panel";
import { AttachmentsTab, AuditTab, BudgetTab, FlagsTab, ReportTab, RevisionsTab, TabNav } from "@/components/finance/review/review-sections";
import { DueBadge, StateBadge } from "@/components/ui/status-badge";
import { AuditTimeline } from "@/components/finance/review/audit-timeline";
import { ProfileHeader } from "@/components/ui/profile-header";
import { Card, CardBody } from "@/components/ui/card";
import { FINANCE_ROLES, REVIEW_ROLES, requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { loadSubmissionDetail } from "@/lib/finance/review/detail";
import { buildConcerns, PRESET_CONCERNS } from "@/lib/finance/review/return-note-core";
import { reportState } from "@/lib/reporting";
import { formatCurrency } from "@/lib/rules/money";
import { isVisible } from "@/lib/rules/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review report" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const TABS = ["report", "budget", "attachments", "flags", "audit", "revisions"];

export default async function ReviewPage({ params, searchParams }: Props) {
  const user = await requireUser(FINANCE_ROLES);
  const { id } = await params;
  const raw = await searchParams;
  const requested = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
  const tab = requested && TABS.includes(requested) ? requested : "report";

  const detail = await withClaims(user.id, (tx) => loadSubmissionDetail(tx, id));
  if (!detail || !detail.row.definition) notFound();
  const { row } = detail;
  const canReview = REVIEW_ROLES.includes(user.role);

  const concerns = [
    ...buildConcerns({ definition: row.definition, issues: row.issues, budget: row.budget, award: row.award, status: row.status, answers: row.answers, openFlags: row.openFlags }),
    ...PRESET_CONCERNS,
  ];

  const labels: Record<string, string> = {};
  const questions: CorrectableQuestion[] = [];
  for (const section of detail.row.definition.sections) {
    for (const q of section.questions) {
      labels[q.key] = q.label;
      if (q.type !== "table" && isVisible(q, row.answers)) {
        const value = row.answers[q.key];
        questions.push({ key: q.key, label: q.label, current: value === null || value === undefined ? "" : String(value) });
      }
    }
  }

  const flagCount = row.flags.length;
  const late = row.status === "draft" || row.status === "returned" ? row.daysPastDue : 0;

  const state = <StateBadge state={reportState(row.status, row.dueOn)} />;
  const recent = detail.audit.slice(-5);

  return (
    <>
      <ProfileHeader
        title={row.initiativeName}
        crumbs={[{ label: "Submissions", href: "/finance/submissions" }, { label: row.referenceNo ?? "Report" }]}
        subtitle={
          <>
            <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
              {row.orgName}
            </Link>
            <span className="text-muted">, {row.borough}</span>
          </>
        }
        meta={[
          state,
          late > 0 ? <DueBadge key="due" daysPastDue={late} /> : null,
          <span key="ref" className="whitespace-nowrap font-mono text-[13px]">{row.referenceNo}</span>,
          <span key="ein" className="whitespace-nowrap">
            EIN <span className="font-mono text-[13px]">{row.ein}</span>
          </span>,
          <span key="rev" className="num whitespace-nowrap">Revision {row.revision}</span>,
          <span key="period" className="whitespace-nowrap">{detail.periodLabel}</span>,
        ]}
        tabs={<TabNav id={id} current={tab} counts={{ attachments: detail.attachments.length, flags: flagCount, audit: detail.audit.length, revisions: detail.revisions.length }} />}
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-sm sm:px-6 md:grid-cols-4">
          {[
            ["Award", <span key="a" className="num font-semibold">{formatCurrency(row.award)}</span>],
            ["Due", formatDate(row.dueOn)],
            ["Submitted by", detail.submittedBy ?? "Not submitted"],
            ["Submitted", row.submittedAt ? formatDateTime(row.submittedAt) : "Not submitted"],
          ].map(([label, value]) => (
            <div key={String(label)} className="min-w-0">
              <dt className="text-[13px] font-semibold text-muted">{label}</dt>
              <dd className="mt-1 truncate text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </ProfileHeader>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="order-2 min-w-0 lg:order-1 lg:col-span-8">
          {tab === "report" ? <ReportTab detail={detail} /> : null}
          {tab === "budget" ? <BudgetTab detail={detail} /> : null}
          {tab === "attachments" ? <AttachmentsTab submissionId={id} attachments={detail.attachments} /> : null}
          {tab === "flags" ? <FlagsTab detail={detail} canReview={canReview} /> : null}
          {tab === "audit" ? <AuditTab audit={detail.audit} labels={labels} /> : null}
          {tab === "revisions" ? <RevisionsTab revisions={detail.revisions} submissionId={id} fileIds={detail.fileIds} /> : null}
        </div>
        <aside className="order-1 space-y-4 lg:sticky lg:top-4 lg:order-2 lg:col-span-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pb-1" aria-label="Review actions">
          {canReview ? (
            <ActionsPanel submissionId={id} status={row.status ?? "draft"} lockVersion={row.lockVersion} concerns={concerns} questions={questions} badge={state} />
          ) : (
            <Card>
              <CardBody className="flex items-start gap-3 text-sm">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <p className="text-muted">You have view only access. Finance analysts and administrators can review, flag and correct reports.</p>
              </CardBody>
            </Card>
          )}
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 className="text-[15px] font-semibold text-ink">Audit timeline</h2>
              {detail.audit.length > recent.length ? (
                <Link href={`/finance/submissions/${id}?tab=audit`} className="text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                  All {detail.audit.length}
                </Link>
              ) : null}
            </div>
            <CardBody>{recent.length === 0 ? <p className="text-sm text-muted">No actions have been recorded.</p> : <AuditTimeline events={recent} labels={labels} compact />}</CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
