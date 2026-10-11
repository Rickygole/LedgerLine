import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Eye } from "lucide-react";
import { ActionsPanel, type CorrectableQuestion } from "@/components/finance/review/actions-panel";
import {
  AttachmentsTab,
  AuditTab,
  BudgetTab,
  FlagsTab,
  ReportTab,
  RevisionsTab,
  TabNav,
} from "@/components/finance/review/review-sections";
import { DueBadge, StateBadge } from "@/components/ui/status-badge";
import { AuditTimeline } from "@/components/finance/review/audit-timeline";
import { Breadcrumbs } from "@/components/ui/page-header";
import { DownloadPdfLink } from "@/components/report/download-pdf";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FINANCE_ROLES, REVIEW_ROLES, requireUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { withClaims } from "@/lib/db";
import { loadSubmissionDetail } from "@/lib/finance/review/detail";
import { buildConcerns, PRESET_CONCERNS } from "@/lib/finance/review/return-note-core";
import { reportState } from "@/lib/reporting";
import { formatCurrency, plural } from "@/lib/format";
import { balanceMessage, budgetTotals, isVisible } from "@/lib/rules/validate";
import { BUDGET_KEY } from "@/lib/finance/review/correction-input";
import { sponsorNames } from "@/lib/finance/awards";

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

  const queued = (Array.isArray(raw.queue) ? raw.queue[0] : raw.queue) === "waiting";
  const { detail, waiting } = await withClaims(user.id, async (tx) => {
    const detail = await loadSubmissionDetail(tx, id);
    const waiting =
      detail && queued
        ? (
            await tx.query<{ id: string }>(
              "SELECT id FROM submission WHERE period_id = $1 AND status = 'submitted' ORDER BY submitted_at NULLS LAST, id",
              [detail.row.periodId],
            )
          ).map((r) => r.id)
        : [];
    return { detail, waiting };
  });
  if (!detail || !detail.row.definition) notFound();
  const { row } = detail;
  const canReview = REVIEW_ROLES.includes(user.role);

  const concerns = [
    ...buildConcerns({
      definition: row.definition,
      issues: row.issues,
      budget: row.budget,
      award: row.award,
      status: row.status,
      answers: row.answers,
      openFlags: row.openFlags,
    }),
    ...PRESET_CONCERNS,
  ];

  const labels: Record<string, string> = {};
  const questions: CorrectableQuestion[] = [];
  for (const section of detail.row.definition.sections) {
    for (const q of section.questions) {
      labels[q.key] = q.label;
      if (!isVisible(q, row.answers)) continue;
      const value = row.answers[q.key];
      if (q.type === "table") {
        const columns = q.columns ?? [];
        const rows = Array.isArray(value) ? value : [];
        questions.push({
          kind: "table",
          key: q.key,
          label: q.label,
          columns,
          rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, String(r[c.key] ?? "")]))),
          maxRows: q.maxRows ?? 50,
        });
      } else {
        questions.push({
          kind: "value",
          key: q.key,
          label: q.label,
          current: value === null || value === undefined ? "" : String(value),
        });
      }
    }
  }
  if (detail.row.definition.budget.enabled) {
    labels[BUDGET_KEY] = "Budget";
    questions.push({
      kind: "budget",
      key: BUDGET_KEY,
      label: "Budget lines",
      maxLines: detail.row.definition.budget.maxLines,
      lines: row.budget.map((line) => ({
        rowId: line.rowId,
        category: line.category,
        description: line.description,
        amount: line.amount.toFixed(2),
      })),
    });
  }

  const flagCount = row.flags.length;
  const late = row.status === "draft" || row.status === "returned" ? row.daysPastDue : 0;
  const state = <StateBadge state={reportState(row.status, row.dueOn)} />;
  const recent = detail.audit.slice(-5);
  const queryTail = queued ? "&queue=waiting" : "";

  const budgetOn = row.definition?.budget.enabled ?? false;
  const total = budgetTotals(row.budget).total;
  const balance = balanceMessage(total, row.award);
  const diff = Math.round((total - row.award) * 100) / 100;
  const budgetText = !budgetOn
    ? null
    : balance.balanced
      ? "Budget balanced"
      : row.budget.length === 0
        ? "No budget lines entered"
        : `Budget ${diff < 0 ? "under" : "over"} by ${formatCurrency(Math.abs(diff), { cents: true })}`;
  const issueText = row.issues.slice(0, 4).map((issue) => issue.message.replace(/\.$/, ""));
  const prefill = [
    budgetOn && !balance.balanced
      ? row.budget.length > 0
        ? `Please review the budget. The total is ${formatCurrency(Math.abs(diff), { cents: true })} ${diff < 0 ? "under" : "over"} the award of ${formatCurrency(row.award, { cents: true })}.`
        : `Please add your budget lines. The total must equal the award of ${formatCurrency(row.award, { cents: true })}.`
      : null,
    issueText.length > 0
      ? `Please fix ${row.issues.length === 1 ? "this answer" : `these ${row.issues.length > issueText.length ? `${row.issues.length} answers, starting with` : "answers"}`}: ${issueText.join("; ")}.`
      : null,
    ...row.openFlags.map((flag) =>
      flag.note?.trim() ? `Council Finance noted: ${flag.note.trim().replace(/\.$/, "")}.` : null,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
  const checks = [
    ...(budgetText ? [{ ok: balance.balanced, text: budgetText, tab: "budget" }] : []),
    {
      ok: row.issues.length === 0,
      text:
        row.issues.length === 0
          ? "All required answers complete"
          : `${row.issues.length} required ${plural(row.issues.length, "answer fails", "answers fail")} a rule`,
      tab: "report",
    },
    {
      ok: row.openFlags.length === 0,
      text: `${row.openFlags.length} open ${plural(row.openFlags.length, "flag", "flags")}`,
      tab: "flags",
    },
  ];

  const lastOf = (action: string) => [...detail.audit].reverse().find((a) => a.action === action);
  const since =
    row.status === "returned"
      ? lastOf("request_update")
        ? formatDate(lastOf("request_update")!.at)
        : null
      : row.status === "accepted" && lastOf("accept")
        ? `Accepted by ${lastOf("accept")!.actor ?? "Finance"}, ${formatDate(lastOf("accept")!.at)}`
        : null;

  const at = waiting.indexOf(id);
  const nextId = at >= 0 ? waiting[at + 1] : waiting[0];
  const prevId = at > 0 ? waiting[at - 1] : null;
  const sponsor =
    row.fundingSource === "speaker"
      ? "Speaker's allocation"
      : row.fundingSource === "citywide"
        ? "Citywide initiative"
        : row.sponsors.length === 1
          ? `Council Member ${row.sponsors[0].name}, District ${row.sponsors[0].district}`
          : row.sponsors.length > 1
            ? `Delegation: ${sponsorNames(row.sponsors)}`
            : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs
          crumbs={[
            { label: "Submissions", href: `/finance/submissions?period=${encodeURIComponent(row.periodId)}` },
            { label: row.referenceNo ?? "Report" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-4">
          {row.status !== "draft" ? <DownloadPdfLink href={`/finance/submissions/${id}/pdf`} /> : null}
        </div>
        {queued ? (
          <nav aria-label="Review queue" className="flex flex-wrap items-center gap-4">
            <p className="text-[15px] text-ink-2">
              {at >= 0 ? (
                <>
                  <span className="num font-semibold text-ink">{at + 1}</span> of{" "}
                  <span className="num">{waiting.length}</span> waiting for review
                </>
              ) : (
                <>
                  <span className="num font-semibold text-ink">{waiting.length}</span> waiting for review
                </>
              )}
            </p>
            {prevId ? (
              <Link
                href={`/finance/submissions/${prevId}?queue=waiting`}
                className="inline-flex items-center gap-1 text-[15px] font-semibold text-link underline underline-offset-2 hover:text-link-hover"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </Link>
            ) : null}
            {nextId ? (
              <Link
                id="queue-next"
                href={`/finance/submissions/${nextId}?queue=waiting`}
                className={buttonClass("secondary", "md")}
              >
                Next submission
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : (
              <span className="text-[15px] text-muted">No more waiting</span>
            )}
          </nav>
        ) : null}
      </div>

      <header className="mb-6 rounded border border-line bg-white">
        <div className="px-5 pb-4 pt-5 sm:px-6">
          <p className="text-sm font-semibold leading-5 text-muted">
            {detail.periodLabel} report · <span className="whitespace-nowrap font-mono">{row.referenceNo}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">
              {row.initiativeName}
            </h1>
            {canReview ? null : state}
            {late > 0 ? <DueBadge daysPastDue={late} /> : null}
          </div>
          <p className="mt-2 text-[15px] leading-[22px] text-ink-2">
            <Link
              href={`/finance/organizations/${row.orgId}`}
              className="font-semibold text-link underline underline-offset-2 hover:text-link-hover"
            >
              {row.orgName}
            </Link>
            {" · "}
            {row.borough}
            {row.councilDistrict ? ` · District ${row.councilDistrict}` : ""}
            {sponsor ? ` · Sponsor: ${sponsor}` : ""}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] md:grid-cols-4">
            {[
              [
                "Award",
                <span key="a" className="num font-semibold">
                  {formatCurrency(row.award)}
                </span>,
              ],
              ["Due", formatDate(row.dueOn)],
              ["Submitted by", detail.submittedBy ?? "Not submitted"],
              ["Submitted at", row.submittedAt ? formatDateTime(row.submittedAt) : "Not submitted"],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-0">
                <dt className="text-sm font-semibold text-ink-2">{label}</dt>
                <dd className="mt-0.5 break-words text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="border-t border-line-soft bg-harbor-50/50 px-5 py-3 sm:px-6">
          <h2 className="sr-only">Automated checks</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
            {checks.map((check) => (
              <li
                key={check.text}
                className={
                  check.ok ? "flex items-center gap-1.5 text-ok" : "flex items-center gap-1.5 font-semibold text-bad"
                }
              >
                {check.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                {check.ok ? (
                  <span>{check.text}</span>
                ) : (
                  <Link
                    href={`/finance/submissions/${id}?tab=${check.tab}${queryTail}`}
                    className="underline underline-offset-2"
                  >
                    {check.text}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t border-line px-3 sm:px-4">
          <TabNav
            id={id}
            current={tab}
            query={queryTail}
            counts={{
              attachments: detail.attachments.length,
              flags: flagCount,
              audit: detail.audit.length,
              revisions: detail.revisions.length,
            }}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className="order-2 min-w-0 lg:order-1 lg:col-span-8">
          {tab === "report" ? <ReportTab detail={detail} /> : null}
          {tab === "budget" ? <BudgetTab detail={detail} /> : null}
          {tab === "attachments" ? <AttachmentsTab submissionId={id} attachments={detail.attachments} /> : null}
          {tab === "flags" ? <FlagsTab detail={detail} canReview={canReview} /> : null}
          {tab === "audit" ? <AuditTab audit={detail.audit} labels={labels} /> : null}
          {tab === "revisions" ? (
            <RevisionsTab revisions={detail.revisions} submissionId={id} fileIds={detail.fileIds} />
          ) : null}
        </div>
        <aside
          className="order-1 space-y-4 lg:sticky lg:top-6 lg:order-2 lg:col-span-4 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pb-1"
          aria-label="Review actions"
        >
          {canReview ? (
            <ActionsPanel
              submissionId={id}
              status={row.status ?? "draft"}
              lockVersion={row.lockVersion}
              concerns={concerns}
              questions={questions}
              badge={state}
              orgName={row.orgName}
              contactName={detail.primaryContact?.name ?? null}
              prefill={prefill}
              since={since}
            />
          ) : (
            <Card>
              <CardBody className="flex items-start gap-3 text-sm">
                <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <p className="text-muted">
                  You have view only access. Finance analysts and administrators can review, flag and correct reports.
                </p>
              </CardBody>
            </Card>
          )}
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 className="text-[17px] font-bold text-ink">Audit timeline</h2>
              {detail.audit.length > recent.length ? (
                <Link
                  href={`/finance/submissions/${id}?tab=audit${queryTail}`}
                  className="text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover"
                >
                  All {detail.audit.length}
                </Link>
              ) : null}
            </div>
            <CardBody>
              {recent.length === 0 ? (
                <p className="text-sm text-muted">No actions have been recorded.</p>
              ) : (
                <AuditTimeline events={recent} labels={labels} compact />
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
