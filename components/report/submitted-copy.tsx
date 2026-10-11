import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates";
import { displayScalar, questionLabel, tableRows } from "@/lib/report/format";
import { formatBytes } from "@/lib/report/upload-rules";
import { isVisible } from "@/lib/rules/validate";
import { AnswerTable } from "./answer-table";
import { BudgetTable } from "./budget-table";
import type { FormDefinition } from "@/lib/rules/types";
import type { Snapshot } from "@/lib/snapshot";
import { DownloadPdfLink } from "./download-pdf";
import { PrintButton } from "./print-button";

export type RevisionView = {
  revision: number;
  kind: "submit" | "correction";
  sha256: string;
  createdAt: string;
  actorName: string | null;
  reason: string | null;
  snapshot: Snapshot;
};

export function SubmittedCopy({
  definition,
  revision,
  awardAmount,
  submissionId,
  files,
}: {
  definition: FormDefinition;
  revision: RevisionView;
  awardAmount: number;
  submissionId: string;
  files: Record<string, string>;
}) {
  const { snapshot } = revision;
  return (
    <div className="space-y-6">
      <style>{`@media print { header, footer, [data-print-hide] { display: none !important; } main { padding: 0 !important; max-width: none !important; } }`}</style>
      <Card>
        <CardHeader
          title="Submitted copy"
          actions={
            <div className="flex flex-wrap gap-3">
              <DownloadPdfLink href={`/portal/reports/${submissionId}/pdf`} />
              <PrintButton />
            </div>
          }
        />
        <CardBody>
          <DescriptionList
            columns={3}
            items={[
              { label: "Revision", value: <span className="num">{revision.revision}</span> },
              {
                label: revision.kind === "correction" ? "Corrected by" : "Submitted by",
                value: revision.actorName ?? "Not recorded",
              },
              { label: "Submitted on", value: `${formatDateTime(revision.createdAt)} ET` },
              {
                label: "Receipt code",
                value: (
                  <span
                    className="font-mono text-sm"
                    title="Council Finance can use this code to confirm this copy has not changed."
                  >
                    {revision.sha256.slice(0, 12)}
                  </span>
                ),
              },
              ...(revision.reason ? [{ label: "Reason for correction", value: revision.reason }] : []),
            ]}
          />
        </CardBody>

        {definition.sections.map((section) => (
          <CopySection key={section.key} title={section.title}>
            {section.kind === "budget" ? (
              <BudgetTable lines={snapshot.budget} award={awardAmount} answers={snapshot.answers} />
            ) : (
              <dl className="space-y-5">
                {section.questions
                  .filter((question) => isVisible(question, snapshot.answers))
                  .map((question) => {
                    const value = snapshot.answers[question.key];
                    const rows = question.type === "table" ? tableRows(question, value) : [];
                    return (
                      <div key={question.key} className="max-w-3xl">
                        <dt className="text-[13px] font-semibold text-muted">{questionLabel(question.label)}</dt>
                        <dd className="mt-1 text-sm text-ink">
                          {question.type === "table" ? (
                            rows.length === 0 ? (
                              <span className="text-muted">No rows</span>
                            ) : (
                              <AnswerTable columns={question.columns ?? []} rows={rows} />
                            )
                          ) : displayScalar(question, value) === "" ? (
                            <span className="text-muted">Not answered</span>
                          ) : (
                            <span className="whitespace-pre-wrap">{displayScalar(question, value)}</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
              </dl>
            )}
          </CopySection>
        ))}

        {snapshot.certification ? (
          <CopySection title="Certification">
            <p className="mb-4 text-sm font-semibold text-ink">{snapshot.certification.statement}</p>
            <DescriptionList
              columns={3}
              items={[
                { label: "Certified by", value: snapshot.certification.name },
                { label: "Title", value: snapshot.certification.title },
                { label: "Certified on", value: `${formatDateTime(snapshot.certification.certifiedAt)} ET` },
              ]}
            />
          </CopySection>
        ) : null}

        <CopySection title="Attachments">
          {snapshot.attachments.length === 0 ? (
            <p className="text-sm text-muted">No files were attached.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {snapshot.attachments.map((file) => (
                <li key={file.path} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <span className="font-semibold text-ink">{file.filename}</span>
                  <span className="flex items-center gap-4 text-muted">
                    <span className="num">{formatBytes(file.bytes)}</span>
                    {files[file.path] ? (
                      <a
                        href={`/portal/reports/${submissionId}/files/${files[file.path]}`}
                        className="no-print font-semibold text-link underline underline-offset-2 hover:text-link-hover"
                        aria-label={`Download ${file.filename}`}
                      >
                        Download
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CopySection>
      </Card>
    </div>
  );
}

function CopySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line-soft px-6 py-6">
      <h2 className="mb-4 text-lg font-bold leading-7 text-ink">{title}</h2>
      {children}
    </section>
  );
}
