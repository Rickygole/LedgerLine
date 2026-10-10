"use client";

import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/status-badge";
import { formatCurrency } from "@/lib/rules/money";
import { displayScalar, questionLabel, tableRows } from "@/lib/report/format";
import { formatBytes } from "@/lib/report/upload-rules";
import type { AttachmentItem } from "@/lib/report/types";
import type { Answers, BudgetLine, FormDefinition, Question } from "@/lib/rules/types";
import { VARIANCE_NOTE_KEY, spendSummary } from "@/lib/rules/spend";
import { budgetTotals, isVisible } from "@/lib/rules/validate";
import { balanceCopy } from "./balance";

const ROW = "grid gap-x-6 gap-y-1 border-b border-line-soft py-3 sm:grid-cols-[40%_minmax(0,1fr)_auto]";

function ChangeLink({ step, target, label, onChange }: { step: string; target?: string; label: string; onChange: (step: string, target?: string) => void }) {
  return (
    <a
      href={`?step=${encodeURIComponent(step)}&return=review`}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        onChange(step, target);
      }}
      className="text-[15px] font-semibold text-link underline underline-offset-2 hover:text-link-hover sm:text-right"
    >
      Change<span className="sr-only"> {label}</span>
    </a>
  );
}

function AnswerValue({ question, answers }: { question: Question; answers: Answers }) {
  const value = answers[question.key];
  if (question.type === "table") {
    const rows = tableRows(question, value);
    if (rows.length === 0) return <span className="text-muted">No rows</span>;
    const columns = question.columns ?? [];
    return (
      <ul className="space-y-0.5">
        {rows.map((row, index) => (
          <li key={index}>{row.map((cell, i) => (columns[i] ? `${columns[i].label}: ${cell || "blank"}` : cell)).join(", ")}</li>
        ))}
      </ul>
    );
  }
  const text = displayScalar(question, value);
  if (text === "") return <span className="text-muted">Not answered</span>;
  return <span className="whitespace-pre-wrap break-words">{text}</span>;
}

export function CheckAnswers({
  definition,
  answers,
  lines,
  award,
  attachments,
  onChange,
}: {
  definition: FormDefinition;
  answers: Answers;
  lines: BudgetLine[];
  award: number;
  attachments: AttachmentItem[];
  onChange: (step: string, target?: string) => void;
}) {
  const totals = budgetTotals(lines);
  const spend = spendSummary(lines, award);
  const balance = balanceCopy(totals.total, award);
  const note = String(answers[VARIANCE_NOTE_KEY] ?? "").trim();
  return (
    <div className="space-y-8">
      {definition.sections.map((section) => (
        <section key={section.key} aria-labelledby={`check-${section.key}`}>
          <h3 id={`check-${section.key}`} className="border-b-2 border-ink pb-2 text-[17px] font-bold leading-6 text-ink">
            {section.title}
          </h3>
          {section.kind === "budget" ? (
            <dl className="text-[15px] leading-[22px]">
              <div className={ROW}>
                <dt className="font-semibold text-ink">Budget total</dt>
                <dd className="num flex flex-wrap items-center gap-2 text-ink">
                  {formatCurrency(totals.total)} of {formatCurrency(award)}
                  {lines.length > 0 ? (
                    <Badge tone={balance.tone} icon={balance.tone === "ok" ? CheckCircle2 : undefined}>
                      {balance.text}
                    </Badge>
                  ) : null}
                </dd>
                <dd>
                  <ChangeLink step={section.key} target="budget-grid" label="budget lines" onChange={onChange} />
                </dd>
              </div>
              <div className={ROW}>
                <dt className="font-semibold text-ink">Personal services (PS)</dt>
                <dd className="num text-ink">{formatCurrency(totals.ps)}</dd>
                <dd />
              </div>
              <div className={ROW}>
                <dt className="font-semibold text-ink">Other than personal services (OTPS)</dt>
                <dd className="num text-ink">{formatCurrency(totals.otps)}</dd>
                <dd />
              </div>
              <div className={ROW}>
                <dt className="font-semibold text-ink">Actual spent</dt>
                <dd className="num text-ink">{spend.entered ? formatCurrency(spend.actual) : <span className="text-muted">Not entered</span>}</dd>
                <dd />
              </div>
              {note ? (
                <div className={ROW}>
                  <dt className="font-semibold text-ink">Variance explanation</dt>
                  <dd className="whitespace-pre-wrap break-words text-ink">{note}</dd>
                  <dd>
                    <ChangeLink step={section.key} target="budget-variance-note" label="variance explanation" onChange={onChange} />
                  </dd>
                </div>
              ) : null}
              {lines.length > 0 ? (
                <details className="group border-b border-line-soft py-3">
                  <summary className="cursor-pointer text-[15px] font-semibold text-link underline underline-offset-2">
                    <span className="group-open:hidden">Show all {lines.length} {lines.length === 1 ? "line" : "lines"}</span>
                    <span className="hidden group-open:inline">Hide budget lines</span>
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-[15px]">
                      <thead className="bg-harbor-50 text-left text-sm font-semibold text-ink-2">
                        <tr>
                          <th scope="col" className="px-3 py-2 text-right">#</th>
                          <th scope="col" className="px-3 py-2">Category</th>
                          <th scope="col" className="px-3 py-2">Description</th>
                          <th scope="col" className="px-3 py-2 text-right">Approved</th>
                          <th scope="col" className="px-3 py-2 text-right">Actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => (
                          <tr key={line.rowId} className="border-b border-line-soft">
                            <td className="num px-3 py-2 text-right text-muted">{index + 1}</td>
                            <td className="px-3 py-2">{line.category}</td>
                            <td className="px-3 py-2">{line.description}</td>
                            <td className="num px-3 py-2 text-right">{formatCurrency(line.amount)}</td>
                            <td className="num px-3 py-2 text-right">{line.actual === null || line.actual === undefined ? "Not entered" : formatCurrency(line.actual)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </dl>
          ) : (
            <dl className="text-[15px] leading-[22px]">
              {section.questions
                .filter((question) => isVisible(question, answers))
                .map((question) => (
                  <div key={question.key} className={ROW}>
                    <dt className="font-semibold text-ink">{questionLabel(question.label)}</dt>
                    <dd className="text-ink">
                      <AnswerValue question={question} answers={answers} />
                    </dd>
                    <dd>
                      <ChangeLink step={section.key} target={`q-${question.key}`} label={questionLabel(question.label).toLowerCase()} onChange={onChange} />
                    </dd>
                  </div>
                ))}
            </dl>
          )}
        </section>
      ))}

      <section aria-labelledby="check-attachments">
        <h3 id="check-attachments" className="border-b-2 border-ink pb-2 text-[17px] font-bold leading-6 text-ink">
          Attachments
        </h3>
        <dl className="text-[15px] leading-[22px]">
          <div className={ROW}>
            <dt className="font-semibold text-ink">Files</dt>
            <dd className="text-ink">
              {attachments.length === 0 ? (
                <span className="text-muted">No files attached</span>
              ) : (
                <ul className="space-y-0.5">
                  {attachments.map((item) => (
                    <li key={item.id} className="break-words">
                      {item.filename} <span className="num text-muted">({formatBytes(item.bytes)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
            <dd>
              <ChangeLink step="attachments" target="attachment-input" label="attachments" onChange={onChange} />
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
