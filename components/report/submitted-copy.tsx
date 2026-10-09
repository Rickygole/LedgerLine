import { Download, Fingerprint } from "lucide-react";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/dates";
import { displayScalar, tableRows } from "@/lib/report/format";
import { formatBytes } from "@/lib/report/upload-rules";
import { formatCurrency } from "@/lib/rules/money";
import { balanceMessage, budgetTotals, isVisible } from "@/lib/rules/validate";
import type { FormDefinition } from "@/lib/rules/types";
import type { Snapshot } from "@/lib/snapshot";
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
  const budget = snapshot.budget.map((line) => ({ ...line, rowId: String(line.position) }));
  const totals = budgetTotals(budget);
  const balance = balanceMessage(totals.total, awardAmount);

  return (
    <div className="space-y-6">
      <style>{`@media print { header, footer, [data-print-hide] { display: none !important; } main { padding: 0 !important; max-width: none !important; } }`}</style>
      <Card>
        <CardHeader
          title="Submitted copy"
          description="This is exactly what Council Finance received. It cannot be edited."
          actions={<PrintButton />}
        />
        <CardBody>
          <DescriptionList
            columns={3}
            items={[
              { label: "Revision", value: <span className="num">{revision.revision}</span> },
              { label: revision.kind === "correction" ? "Corrected by" : "Submitted by", value: revision.actorName ?? "Not recorded" },
              { label: "Submitted on", value: `${formatDateTime(revision.createdAt)} ET` },
              {
                label: "Fingerprint (SHA-256)",
                value: (
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs" title={revision.sha256}>
                    <Fingerprint className="h-4 w-4 text-muted" aria-hidden="true" />
                    {revision.sha256.slice(0, 12)}
                  </span>
                ),
              },
              ...(revision.reason ? [{ label: "Reason for correction", value: revision.reason }] : []),
            ]}
          />
        </CardBody>
      </Card>

      {definition.sections.map((section) => (
        <Card key={section.key}>
          <CardHeader title={section.title} />
          <CardBody>
            {section.kind === "budget" ? (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-md border border-line">
                  <Table>
                    <THead>
                      <tr>
                        <TH>Line</TH>
                        <TH>Category</TH>
                        <TH>Description</TH>
                        <TH align="right">Amount</TH>
                      </tr>
                    </THead>
                    <tbody>
                      {snapshot.budget.length === 0 ? <EmptyRow colSpan={4}>No budget lines.</EmptyRow> : null}
                      {snapshot.budget.map((line) => (
                        <TR key={line.position}>
                          <TD className="num">{line.position}</TD>
                          <TD>{line.category}</TD>
                          <TD>{line.description}</TD>
                          <TD align="right">{formatCurrency(line.amount)}</TD>
                        </TR>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-line bg-surface/60 text-sm font-semibold">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right">PS subtotal</td>
                        <td className="num px-4 py-2 text-right">{formatCurrency(totals.ps)}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right">OTPS subtotal</td>
                        <td className="num px-4 py-2 text-right">{formatCurrency(totals.otps)}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right">Total</td>
                        <td className="num px-4 py-2 text-right">{formatCurrency(totals.total)}</td>
                      </tr>
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right">Award</td>
                        <td className="num px-4 py-2 text-right">{formatCurrency(awardAmount)}</td>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
                <p className="text-sm text-muted">{balance.message}</p>
              </div>
            ) : (
              <dl className="space-y-5">
                {section.questions
                  .filter((question) => isVisible(question, snapshot.answers))
                  .map((question) => {
                    const value = snapshot.answers[question.key];
                    const rows = question.type === "table" ? tableRows(question, value) : [];
                    return (
                      <div key={question.key} className="max-w-3xl">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{question.label}</dt>
                        <dd className="mt-1 text-sm text-ink">
                          {question.type === "table" ? (
                            rows.length === 0 ? (
                              <span className="text-muted">No rows</span>
                            ) : (
                              <div className="overflow-hidden rounded-md border border-line">
                                <Table>
                                  <THead>
                                    <tr>
                                      {(question.columns ?? []).map((column) => (
                                        <TH key={column.key}>{column.label}</TH>
                                      ))}
                                    </tr>
                                  </THead>
                                  <tbody>
                                    {rows.map((row, index) => (
                                      <TR key={index}>
                                        {row.map((cell, cellIndex) => (
                                          <TD key={cellIndex}>{cell}</TD>
                                        ))}
                                      </TR>
                                    ))}
                                  </tbody>
                                </Table>
                              </div>
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
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader title="Attachments" />
        <CardBody>
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
                      <a href={`/portal/reports/${submissionId}/files/${files[file.path]}`} className="no-print inline-flex items-center gap-1.5 font-semibold text-navy-800 hover:underline" aria-label={`Download ${file.filename}`}>
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Download
                      </a>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
