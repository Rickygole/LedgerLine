import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye } from "lucide-react";
import { ActionsPanel, type CorrectableQuestion } from "@/components/finance/review/actions-panel";
import { AttachmentsTab, AuditTab, BudgetTab, FlagsTab, ReportTab, RevisionsTab, TabNav } from "@/components/finance/review/review-sections";
import { Badge, DueBadge, StateBadge } from "@/components/ui/status-badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
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

  const openFlagCount = detail.flags.filter((f) => f.status === "open").length;
  const late = row.status === "draft" || row.status === "returned" ? row.daysPastDue : 0;

  return (
    <>
      <PageHeader
        title={row.initiativeName}
        crumbs={[{ label: "Submissions", href: "/finance/submissions" }, { label: row.referenceNo ?? "Report" }]}
        description={
          <>
            <Link href={`/finance/organizations/${row.orgId}`} className="font-semibold text-navy-700 hover:underline">
              {row.orgName}
            </Link>{" "}
            <span className="num">(EIN {row.ein})</span>, {row.borough}
          </>
        }
        meta={
          <>
            <StateBadge state={reportState(row.status, row.dueOn)} />
            {row.status === "draft" || row.status === "returned" ? <DueBadge daysPastDue={late} /> : null}
            <Badge>{row.referenceNo}</Badge>
            <Badge>Revision {row.revision}</Badge>
            <Badge>{detail.periodLabel}</Badge>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 rounded-lg border border-line bg-white px-5 py-4 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] md:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Award</p>
          <p className="num mt-1 font-semibold">{formatCurrency(row.award)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Due</p>
          <p className="mt-1">{formatDate(row.dueOn)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Submitted by</p>
          <p className="mt-1">{detail.submittedBy ?? "Not submitted"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Submitted</p>
          <p className="mt-1">{row.submittedAt ? formatDateTime(row.submittedAt) : "Not submitted"}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 order-2 xl:order-1">
          <TabNav id={id} current={tab} counts={{ attachments: detail.attachments.length, flags: openFlagCount, audit: detail.audit.length, revisions: detail.revisions.length }} />
          {tab === "report" ? <ReportTab detail={detail} /> : null}
          {tab === "budget" ? <BudgetTab detail={detail} /> : null}
          {tab === "attachments" ? <AttachmentsTab submissionId={id} attachments={detail.attachments} /> : null}
          {tab === "flags" ? <FlagsTab detail={detail} canReview={canReview} /> : null}
          {tab === "audit" ? <AuditTab audit={detail.audit} labels={labels} /> : null}
          {tab === "revisions" ? <RevisionsTab revisions={detail.revisions} /> : null}
        </div>
        <aside className="order-1 space-y-4 xl:order-2" aria-label="Review actions">
          {canReview ? (
            <ActionsPanel submissionId={id} status={row.status ?? "draft"} lockVersion={row.lockVersion} concerns={concerns} questions={questions} />
          ) : (
            <Card>
              <CardBody className="flex items-start gap-3 text-sm">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <p className="text-muted">You have view only access. Finance analysts and administrators can review, flag and correct reports.</p>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
