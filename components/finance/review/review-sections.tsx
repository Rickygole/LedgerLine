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
import { isVisible } from "@/lib/rules/validate";
import { BudgetTable } from "@/components/report/budget-table";
import { formatCount, formatCurrency } from "@/lib/rules/money";
import { cellText } from "@/lib/report/format";
import type { AnswerValue, FormDefinition, Question } from "@/lib/rules/types";

function formatValue(question: Question, value: AnswerValue | undefined): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-muted">Not answered</span>;
  if (question.type === "table" && Array.isArray(value)) {
    const columns = question.columns ?? [];
    const filled = value.filter((row) => columns.some((c) => String(row[c.key] ?? "").trim() !== ""));
    if (filled.length === 0) return <span className="text-muted">No rows entered</span>;
    return (
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface/70 text-left text-[13px] font-semibold text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-3 py-2 ${c.type === "text" ? "" : "text-right"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filled.map((row, index) => (
              <tr key={index} className="border-t border-line">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${c.type === "text" ? "" : "num text-right"}`}>
                    {cellText(c.type, row[c.key])}
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
  if (question.type === "integer" || question.type === "number") return <span className="num">{formatCount(String(value))}</span>;
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

function CorrectionNote({ fix }: { fix: Correction | undefined }) {
  if (!fix) return null;
  return (
    <span className="mt-1.5 block text-xs text-muted">
      <span className="font-semibold text-ink">Corrected by {fix.by}</span>
      {fix.original !== undefined && fix.original !== null && fix.original !== "" ? (
        <>
          {". Was "}
          <del>{String(fix.original)}</del>
        </>
      ) : ". Was blank"}
    </span>
  );
}

const CONTACT_KEYS = ["org_legal_name", "org_ein", "contact_name", "contact_title", "contact_email", "contact_phone"];

function text(value: AnswerValue | undefined): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function count(value: AnswerValue | undefined): number | null {
  const raw = text(value).replace(/,/g, "");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function Served({ detail }: { detail: SubmissionDetail }) {
  const { answers, periodId } = detail.row;
  const actual = count(answers.participants_actual);
  const target = count(answers.participants_target);
  if (actual === null) return <span className="text-muted">Not answered</span>;
  const share = target && target > 0 ? Math.round((actual / target) * 100) : null;
  return (
    <>
      <span className="num">
        {formatCount(actual)}
        {target !== null ? ` of ${formatCount(target)} targeted` : ""}
      </span>
      {share !== null ? <span className={share < 40 ? "num font-semibold text-bad" : "num text-ink-2"}> ({share} percent)</span> : null}
      {detail.earlier && periodId.endsWith("-YE") ? (
        <span className="num block text-[13px] text-muted">
          {detail.earlier.label.replace(/^FY\d+ /, "")} reported {formatCount(detail.earlier.served)}
        </span>
      ) : null}
    </>
  );
}

export function ReportTab({ detail }: { detail: SubmissionDetail }) {
  const { row } = detail;
  const definition = row.definition as FormDefinition;
  const sections = definition.sections.filter((section) => section.kind === "questions");
  const corrections = correctionsFrom(detail);
  const contactCorrected = CONTACT_KEYS.some((key) => corrections[key]);
  return (
    <Card>
      <CardBody>
        {sections.map((section, index) => {
          const all = section.questions.filter((q) => isVisible(q, row.answers));
          const compactContact = section.key === "organization" && !contactCorrected;
          const merged = all.some((q) => q.key === "participants_actual") && !corrections.participants_target;
          const questions = all.filter((q) => !(compactContact && CONTACT_KEYS.includes(q.key)) && !(merged && q.key === "participants_target"));
          const contactLine = [[text(row.answers.contact_name), text(row.answers.contact_title)].filter(Boolean).join(", "), text(row.answers.contact_email), text(row.answers.contact_phone)].filter(Boolean);
          return (
            <section key={section.key} id={`review-${section.key}`} aria-labelledby={`review-${section.key}-title`} className={index > 0 ? "mt-6 scroll-mt-4 border-t border-line-soft pt-6" : "scroll-mt-4"}>
              <h2 id={`review-${section.key}-title`} className="text-xl font-bold leading-7 text-ink">
                {section.title}
              </h2>
              {compactContact ? (
                <div className="mt-2 text-[15px] leading-[22px]">
                  <p className="text-ink">
                    {contactLine.length > 0
                      ? contactLine.map((part, i) => (
                          <span key={part}>
                            {i > 0 ? " · " : null}
                            <span className="whitespace-nowrap">{part}</span>
                          </span>
                        ))
                      : <span className="text-muted">No report contact entered</span>}
                  </p>
                  <p className="num text-[13px] text-muted">{[text(row.answers.org_legal_name), text(row.answers.org_ein)].filter(Boolean).join(" · ")}</p>
                </div>
              ) : null}
              {questions.length > 0 ? (
                <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                  {questions.map((q) => (
                    <div key={q.key} className={q.type === "textarea" || q.type === "table" ? "min-w-0 md:col-span-2" : "min-w-0"}>
                      <dt className="text-[13px] font-semibold text-muted">{merged && q.key === "participants_actual" ? "Participants served" : q.label}</dt>
                      <dd className="mt-1 break-words text-sm text-ink">
                        {merged && q.key === "participants_actual" ? <Served detail={detail} /> : formatValue(q, row.answers[q.key])}
                        <CorrectionNote fix={corrections[q.key]} />
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          );
        })}
        {detail.certification ? (
          <section id="review-certification" aria-labelledby="review-certification-title" className="mt-6 scroll-mt-4 border-t border-line-soft pt-6">
            <h2 id="review-certification-title" className="text-xl font-bold leading-7 text-ink">
              Certification
            </h2>
            <p className="mt-0.5 text-sm leading-5 text-muted">{detail.certification.statement}</p>
            <p className="mt-3 text-[15px] text-ink">
              {detail.certification.name}, {detail.certification.title} · <span className="num">{formatDateTime(detail.certification.certifiedAt)} ET</span>
            </p>
          </section>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function BudgetTab({ detail }: { detail: SubmissionDetail }) {
  const { row } = detail;
  return (
    <Card>
      <CardHeader title="Budget" description="Personal services (PS) and other than personal services (OTPS) lines as reported, with actual spent and variance." />
      <CardBody>
        {row.budget.length === 0 ? (
          <p className="text-sm text-muted">No budget has been entered yet.</p>
        ) : (
          <BudgetTable lines={row.budget} award={row.award} answers={row.answers} totalLabel="Total reported" />
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
                  <a href={`/finance/submissions/${submissionId}/attachments/${a.id}`} className="inline-flex items-center gap-1.5 font-semibold text-link underline underline-offset-2 hover:text-link-hover">
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

export function RevisionsTab({ revisions, submissionId, fileIds }: { revisions: RevisionRecord[]; submissionId: string; fileIds: Record<string, string> }) {
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
            <TH>Files</TH>
            <TH>When</TH>
            <TH>Fingerprint</TH>
          </tr>
        </THead>
        <tbody>
          {revisions.length === 0 ? (
            <EmptyRow colSpan={7}>No revisions yet. The first is created when the report is submitted.</EmptyRow>
          ) : (
            revisions.map((r) => (
              <TR key={r.id}>
                <TD align="right">{r.revision}</TD>
                <TD>{r.kind === "submit" ? "Submitted" : "Correction"}</TD>
                <TD>{r.actor}</TD>
                <TD className="text-muted">{r.reason ?? "None"}</TD>
                <TD>
                  {r.files.length === 0 ? (
                    <span className="text-muted">None</span>
                  ) : (
                    <ul className="space-y-1">
                      {r.files.map((file) => (
                        <li key={file.path} className="flex items-center gap-1.5">
                          {fileIds[file.path] ? (
                            <a href={`/finance/submissions/${submissionId}/attachments/${fileIds[file.path]}`} className="inline-flex items-center gap-1.5 font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                              <Download className="h-3.5 w-3.5" aria-hidden="true" />
                              {file.filename}
                            </a>
                          ) : (
                            <span>{file.filename}</span>
                          )}
                          <span className="num text-xs text-muted">{formatBytes(file.bytes)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TD>
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

export function TabNav({ id, current, counts, query = "" }: { id: string; current: string; counts: Record<string, number | undefined>; query?: string }) {
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
            href={`/finance/submissions/${id}?tab=${key}${query}`}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-3 text-[15px] font-semibold ${active ? "border-action text-harbor-900" : "border-transparent text-ink-2 hover:border-line-strong hover:text-ink"}`}
          >
            {label}
            {counts[key] !== undefined ? <span className={`num rounded-sm px-1.5 text-xs font-semibold ${active ? "bg-harbor-800 text-white" : "bg-surface text-muted"}`}>{counts[key]}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
