import Link from "next/link";
import { Download } from "lucide-react";
import { AuditTimeline } from "@/components/finance/review/audit-timeline";
import { FlagResolve } from "@/components/finance/review/flag-resolve";
import { FlagBadge } from "@/components/ui/status-badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import type { AttachmentRow, AuditRecord, FlagRecord, RevisionRecord, SubmissionDetail } from "@/lib/finance/review/detail";
import { FLAG_LABEL } from "@/lib/finance/review/filters";
import { budgetTotals, isVisible } from "@/lib/rules/validate";
import { balanceCopy } from "@/components/report/balance";
import { formatCurrency } from "@/lib/rules/money";
import type { AnswerValue, FormDefinition, Question } from "@/lib/rules/types";

function formatValue(question: Question, value: AnswerValue | undefined): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted">Not answered</span>;
  if (question.type === "table" && Array.isArray(value)) {
    const columns = question.columns ?? [];
    return (
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface/70 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-3 py-2 ${c.type === "text" ? "" : "text-right"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.map((row, index) => (
              <tr key={index} className="border-t border-line">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${c.type === "text" ? "" : "num text-right"}`}>
                    {String(row[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (question.type === "currency") return <span className="num">{formatCurrency(Number(String(value).replace(/[$,]/g, "")))}</span>;
  if (question.type === "percent") return <span className="num">{String(value)}%</span>;
  if (question.type === "integer" || question.type === "number") return <span className="num">{String(value)}</span>;
  if (question.type === "textarea") return <span className="block whitespace-pre-wrap">{String(value)}</span>;
  return String(value);
}

type Correction = { by: string; original: AnswerValue | undefined; at: string };

function correctionsFrom(detail: SubmissionDetail): Record<string, Correction> {
  const map: Record<string, Correction> = {};
  for (const event of detail.audit) {
    if (event.action !== "correction") continue;
    const key = String(event.after?.question_key ?? "");
    if (!key) continue;
    const original = map[key]?.original ?? (event.before?.value as AnswerValue | undefined);
    map[key] = { by: event.actor ?? "Finance", original, at: event.at };
  }
  return map;
}

export function ReportTab({ detail }: { detail: SubmissionDetail }) {
  const { row } = detail;
  const definition = row.definition as FormDefinition;
  const sections = definition.sections.filter((section) => section.kind === "questions");
  const corrections = correctionsFrom(detail);
  return (
    <div className="space-y-5">
      <nav aria-label="Jump to a section" className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        <span className="mr-1 text-muted">Jump to</span>
        {sections.map((section) => (
          <a key={section.key} href={`#review-${section.key}`} className="rounded-md px-2 py-1 font-medium text-navy-700 hover:bg-navy-50 hover:underline">
            {section.title}
          </a>
        ))}
        <Link href={`/finance/submissions/${row.submissionId}?tab=budget`} className="rounded-md px-2 py-1 font-medium text-navy-700 hover:bg-navy-50 hover:underline">
          Budget
        </Link>
      </nav>
      {sections.map((section) => {
        const questions = section.questions.filter((q) => isVisible(q, row.answers));
        return (
          <Card key={section.key} id={`review-${section.key}`} className="scroll-mt-4">
            <CardHeader title={section.title} description={section.description} />
            <CardBody>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                {questions.map((q) => {
                  const fix = corrections[q.key];
                  return (
                    <div key={q.key} className={q.type === "textarea" || q.type === "table" ? "md:col-span-2" : ""}>
                      <dt className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{q.label}</dt>
                      <dd className="mt-1 text-sm text-ink">
                        {formatValue(q, row.answers[q.key])}
                        {fix ? (
                          <span className="mt-1.5 block text-xs text-muted">
                            <span className="font-semibold text-ink">Corrected by {fix.by}</span>
                            {fix.original !== undefined && fix.original !== null && fix.original !== "" ? (
                              <>
                                {". Was "}
                                <del>{String(fix.original)}</del>
                              </>
                            ) : ". Was blank"}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

export function BudgetTab({ detail }: { detail: SubmissionDetail }) {
  const { row } = detail;
  const totals = budgetTotals(row.budget);
  const balance = balanceCopy(totals.total, row.award);
  return (
    <Card>
      <CardHeader title="Budget" description="Personnel services (PS) and other than personnel services (OTPS) lines as reported." />
      <Table>
        <THead>
          <tr>
            <TH align="right">Line</TH>
            <TH>Category</TH>
            <TH>Description</TH>
            <TH align="right">Amount</TH>
          </tr>
        </THead>
        <tbody>
          {row.budget.length === 0 ? (
            <EmptyRow colSpan={4}>No budget lines have been entered.</EmptyRow>
          ) : (
            row.budget.map((line) => (
              <TR key={line.rowId}>
                <TD align="right">{line.position}</TD>
                <TD className="whitespace-nowrap">{line.category}</TD>
                <TD>{line.description || <span className="text-muted">No description</span>}</TD>
                <TD align="right">{formatCurrency(line.amount)}</TD>
              </TR>
            ))
          )}
        </tbody>
        <tfoot className="border-t border-line bg-surface/50 text-sm">
          <tr>
            <td colSpan={3} className="px-4 py-2 text-right font-semibold">Personnel services (PS) subtotal</td>
            <td className="num px-4 py-2 text-right">{formatCurrency(totals.ps)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="px-4 py-2 text-right font-semibold">Other than personnel services (OTPS) subtotal</td>
            <td className="num px-4 py-2 text-right">{formatCurrency(totals.otps)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="px-4 py-2 text-right font-semibold">Total reported</td>
            <td className="num px-4 py-2 text-right font-bold">{formatCurrency(totals.total)}</td>
          </tr>
          <tr>
            <td colSpan={3} className="px-4 py-2 text-right font-semibold">Award</td>
            <td className="num px-4 py-2 text-right">{formatCurrency(row.award)}</td>
          </tr>
        </tfoot>
      </Table>
      <CardBody>
        {row.budget.length === 0 ? (
          <p className="text-sm text-muted">No budget has been entered yet.</p>
        ) : (
          <p className={`num inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${balance.tone === "ok" ? "bg-ok-bg text-ok ring-ok/25" : balance.tone === "warn" ? "bg-warn-bg text-warn ring-warn/30" : "bg-bad-bg text-bad ring-bad/25"}`}>{balance.text}</p>
        )}
      </CardBody>
    </Card>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function AttachmentsTab({ submissionId, attachments }: { submissionId: string; attachments: AttachmentRow[] }) {
  return (
    <Card>
      <CardHeader title="Attachments" description="Supporting files uploaded by the organization." />
      <Table>
        <THead>
          <tr>
            <TH>File</TH>
            <TH>Type</TH>
            <TH align="right">Size</TH>
            <TH>Uploaded</TH>
            <TH>
              <span className="sr-only">Download</span>
            </TH>
          </tr>
        </THead>
        <tbody>
          {attachments.length === 0 ? (
            <EmptyRow colSpan={5}>No files were attached to this report.</EmptyRow>
          ) : (
            attachments.map((a) => (
              <TR key={a.id}>
                <TD className="font-medium">{a.filename}</TD>
                <TD className="text-muted">{a.mime.split("/").pop()}</TD>
                <TD align="right">{formatBytes(a.bytes)}</TD>
                <TD className="text-muted">
                  {formatDateTime(a.createdAt)}
                  {a.uploadedBy ? ` by ${a.uploadedBy}` : ""}
                </TD>
                <TD className="text-right">
                  <a href={`/finance/submissions/${submissionId}/attachments/${a.id}`} className="inline-flex items-center gap-1.5 font-semibold text-navy-700 hover:underline">
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download
                  </a>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

export function FlagsTab({ detail, canReview }: { detail: SubmissionDetail; canReview: boolean }) {
  const open = detail.flags.filter((f) => f.status === "open");
  const closed = detail.flags.filter((f) => f.status !== "open");
  const item = (flag: FlagRecord) => (
    <li key={flag.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
          <FlagBadge label={FLAG_LABEL[flag.kind === "spend_spike" ? "manual" : flag.kind] ?? flag.kind} />
          <span className="font-normal text-muted">
            Added {formatDateTime(flag.createdAt)}
            {flag.createdBy ? ` by ${flag.createdBy}` : ""}
          </span>
        </p>
        <p className="mt-1.5 text-sm text-ink">{flag.note ?? "No note"}</p>
        {flag.status !== "open" ? (
          <p className="mt-1 text-xs text-muted">
            {flag.status === "resolved" ? "Resolved" : "Dismissed"} {flag.resolvedAt ? formatDateTime(flag.resolvedAt) : ""}
            {flag.resolvedBy ? ` by ${flag.resolvedBy}` : ""}
          </p>
        ) : null}
      </div>
      {flag.status === "open" && canReview ? <FlagResolve submissionId={detail.row.submissionId!} flagId={flag.id} /> : null}
    </li>
  );
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Automatic findings" description="Computed from the report as it stands now." />
        {detail.row.flags.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No automatic findings. The report passes the budget, completeness and outcome checks.</p>
        ) : (
          <ul className="divide-y divide-line">
            {detail.row.flags.map((flag) => (
              <li key={flag.reason} className="px-5 py-3 text-sm">
                <FlagBadge label={FLAG_LABEL[flag.reason]} />
                <p className="mt-1.5 text-ink">{flag.evidence}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title={`Open flags (${open.length})`} description="Flags added by Finance staff." />
        {open.length === 0 ? <p className="px-5 py-6 text-sm text-muted">There are no open flags on this report.</p> : <ul className="divide-y divide-line">{open.map(item)}</ul>}
      </Card>
      {closed.length > 0 ? (
        <Card>
          <CardHeader title={`Closed flags (${closed.length})`} />
          <ul className="divide-y divide-line">{closed.map(item)}</ul>
        </Card>
      ) : null}
    </div>
  );
}

export function AuditTab({ audit, labels }: { audit: AuditRecord[]; labels: Record<string, string> }) {
  return (
    <Card>
      <CardHeader title="Audit timeline" description="Every recorded action on this report, oldest first. Entries cannot be changed or deleted." />
      <CardBody className="py-5">
        {audit.length === 0 ? <p className="py-8 text-center text-sm text-muted">No actions have been recorded.</p> : <AuditTimeline events={audit} labels={labels} />}
      </CardBody>
    </Card>
  );
}

export function RevisionsTab({ revisions }: { revisions: RevisionRecord[] }) {
  return (
    <Card>
      <CardHeader title="Revisions" description="A frozen copy of the report is kept each time it is submitted or corrected." />
      <Table>
        <THead>
          <tr>
            <TH align="right">Revision</TH>
            <TH>Kind</TH>
            <TH>By</TH>
            <TH>Reason</TH>
            <TH>When</TH>
            <TH>Fingerprint</TH>
          </tr>
        </THead>
        <tbody>
          {revisions.length === 0 ? (
            <EmptyRow colSpan={6}>No revisions yet. The first is created when the report is submitted.</EmptyRow>
          ) : (
            revisions.map((r) => (
              <TR key={r.id}>
                <TD align="right">{r.revision}</TD>
                <TD>{r.kind === "submit" ? "Submitted" : "Correction"}</TD>
                <TD>{r.actor}</TD>
                <TD className="text-muted">{r.reason ?? "None"}</TD>
                <TD className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</TD>
                <TD>
                  <code className="num rounded bg-surface px-1.5 py-0.5 text-xs" title={r.sha256}>
                    {r.sha256.slice(0, 10)}
                  </code>
                </TD>
              </TR>
            ))
          )}
        </tbody>
      </Table>
    </Card>
  );
}

export function TabNav({ id, current, counts }: { id: string; current: string; counts: Record<string, number | undefined> }) {
  const tabs = [
    ["report", "Report"],
    ["budget", "Budget"],
    ["attachments", "Attachments"],
    ["flags", "Flags"],
    ["audit", "Audit timeline"],
    ["revisions", "Revisions"],
  ];
  return (
    <nav aria-label="Report sections" className="-mb-px flex gap-1 overflow-x-auto">
      {tabs.map(([key, label]) => {
        const active = current === key;
        return (
          <Link
            key={key}
            href={`/finance/submissions/${id}?tab=${key}`}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${active ? "border-navy-800 font-semibold text-navy-900" : "border-transparent text-muted hover:border-line-strong hover:text-ink"}`}
          >
            {label}
            {counts[key] !== undefined ? <span className={`num rounded-full px-1.5 text-xs font-semibold ${active ? "bg-navy-800 text-white" : "bg-surface text-muted"}`}>{counts[key]}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
