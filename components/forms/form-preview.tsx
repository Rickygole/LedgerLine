import { Lock } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Hint, Label } from "@/components/ui/field";
import type { FormDefinition, Question } from "@/lib/rules/types";

const controlClass = "block w-full rounded-md border border-line bg-surface px-3 py-2 text-base text-muted sm:text-sm";

function limitText(question: Question): string | null {
  if (question.maxWords) return `Up to ${question.maxWords} words`;
  if (question.maxLength) return `Up to ${question.maxLength} characters`;
  return null;
}

function PreviewControl({ question, id }: { question: Question; id: string }) {
  const describedBy = `${id}-help`;
  switch (question.type) {
    case "textarea":
      return <textarea id={id} disabled aria-describedby={describedBy} className={`${controlClass} min-h-24`} placeholder="Response appears here" />;
    case "select":
      return (
        <select id={id} disabled aria-describedby={describedBy} className={`${controlClass} h-10`}>
          <option>Choose one</option>
          {(question.options ?? []).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      );
    case "yesno":
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-6 text-sm text-muted">
          {["Yes", "No"].map((choice) => (
            <label key={choice} className="flex items-center gap-2">
              <input type="radio" disabled name={id} /> {choice}
            </label>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                {(question.columns ?? []).map((column) => (
                  <th key={column.key} scope="col" className="px-3 py-2">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {(question.columns ?? []).map((column) => (
                  <td key={column.key} className="px-3 py-2 text-muted">
                    {column.type === "text" ? "Entry" : "0"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      );
    default: {
      const placeholder: Record<string, string> = { currency: "$0.00", percent: "0%", integer: "0", number: "0", date: "MM/DD/YYYY", email: "name@example.org", phone: "(212) 555-0100", ein: "00-0000000" };
      return <input id={id} disabled aria-describedby={describedBy} className={`${controlClass} h-10 ${["currency", "percent", "integer", "number"].includes(question.type) ? "num text-right" : ""}`} placeholder={placeholder[question.type] ?? "Response appears here"} />;
    }
  }
}

function conditionText(definition: FormDefinition, question: Question): string | null {
  if (!question.visibleWhen) return null;
  const source = definition.sections.flatMap((s) => s.questions).find((q) => q.key === question.visibleWhen?.key);
  return `Shown only when the answer to "${source?.label ?? question.visibleWhen.key}" is ${question.visibleWhen.equals}.`;
}

export function FormPreview({ definition, awardLabel, only }: { definition: FormDefinition; awardLabel?: string; only?: string }) {
  return (
    <div className="space-y-6">
      {only ? null : (
        <>
          <div className="flex items-start gap-3 rounded-md border border-info/20 bg-info-bg px-4 py-3 text-sm text-info" role="note">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>This is a read-only preview of the form exactly as a funded organization sees it. Nothing you type here is saved.</p>
          </div>
          <h2 className="text-xl font-bold text-ink">{definition.title}</h2>
        </>
      )}
      {definition.sections.map((section, sectionIndex) => only && section.key !== only ? null : (
        <Card key={section.key}>
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-base font-semibold text-ink">
              {sectionIndex + 1}. {section.title}
            </h3>
            {section.description ? <p className="mt-0.5 text-sm text-muted">{section.description}</p> : null}
          </div>
          <CardBody className="space-y-6">
            {section.kind === "budget" ? (
              definition.budget.enabled ? (
                <div className="space-y-3 text-sm">
                  <p className="text-ink">
                    Enter one line per expense with a category (Personal Services or Other Than Personal Services), a description and an amount. You can paste rows from Excel. Up to {definition.budget.maxLines} lines.
                  </p>
                  {definition.budget.mustEqualAward ? <p className="font-semibold text-ink">The budget total must equal your award{awardLabel ? ` of ${awardLabel}` : ""} before you can submit.</p> : <p className="text-muted">The budget total does not need to equal your award.</p>}
                  <div className="overflow-x-auto rounded-md border border-line">
                    <table className="w-full text-sm">
                      <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-muted">
                        <tr>
                          <th scope="col" className="px-3 py-2">Category</th>
                          <th scope="col" className="px-3 py-2">Description</th>
                          <th scope="col" className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-3 py-2 text-muted">PS</td>
                          <td className="px-3 py-2 text-muted">Program coordinator</td>
                          <td className="num px-3 py-2 text-right text-muted">$0.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">This form does not collect a budget.</p>
              )
            ) : section.questions.length === 0 ? (
              <p className="text-sm text-muted">This section has no questions yet.</p>
            ) : (
              section.questions.map((question) => {
                const id = `preview-${question.key}`;
                const limit = limitText(question);
                const condition = conditionText(definition, question);
                return (
                  <div key={question.key}>
                    <Label htmlFor={question.type === "yesno" ? undefined : id} required={question.required}>
                      <span id={`${id}-label`}>{question.label}</span>
                    </Label>
                    <div id={`${id}-help`}>
                      {question.help ? <Hint>{question.help}</Hint> : null}
                      {limit ? <p className="mb-1.5 text-xs text-muted">{limit}</p> : null}
                      {condition ? <p className="mb-1.5 text-xs text-muted">{condition}</p> : null}
                    </div>
                    <PreviewControl question={question} id={id} />
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
