"use client";

import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Hint, Input, Label, Select } from "@/components/ui/field";
import { isSummable, targetText } from "@/lib/rules/sums";
import type { FormDefinition, GroupSumRule, Question, SumTarget } from "@/lib/rules/types";

type Props = {
  definition: FormDefinition;
  editable: boolean;
  onChange: (rules: GroupSumRule[]) => void;
};

function nextKey(rules: GroupSumRule[]): string {
  const taken = new Set(rules.map((rule) => rule.key));
  let n = rules.length + 1;
  while (taken.has(`sum_rule_${n}`)) n += 1;
  return `sum_rule_${n}`;
}

export function SumRules({ definition, editable, onChange }: Props) {
  const id = useId();
  const rules = definition.sumRules ?? [];
  const questions = definition.sections.flatMap((section) => section.questions);
  const candidates = questions.filter((question) => isSummable(question.type));
  const [picked, setPicked] = useState<string[]>([]);
  const [kind, setKind] = useState<"number" | "award">("number");
  const [value, setValue] = useState("100");

  const chosen = picked
    .map((key) => candidates.find((question) => question.key === key))
    .filter((question): question is Question => Boolean(question));
  const sameType = new Set(chosen.map((question) => question.type)).size <= 1;
  const awardOk = kind !== "award" || chosen.every((question) => question.type === "currency");
  const amount = Number(value);
  const valueOk = kind === "award" || (value.trim() !== "" && Number.isFinite(amount) && amount >= 0);
  const valueMessage =
    kind === "award" || valueOk
      ? null
      : Number.isFinite(amount) && value.trim() !== "" && amount < 0
        ? "A sum rule cannot add up to a negative number. Enter zero or more."
        : "Enter a number of zero or more.";
  const hint =
    valueMessage && chosen.length >= 2
      ? valueMessage
      : chosen.length < 2
        ? "Choose at least two questions."
        : !sameType
          ? "Choose questions with the same answer type."
          : !awardOk
            ? "Only dollar amount questions can add up to the award."
            : null;

  function add() {
    if (hint) return;
    const target: SumTarget = kind === "award" ? "award" : amount;
    onChange([...rules, { key: nextKey(rules), fields: chosen.map((question) => question.key), target }]);
    setPicked([]);
  }

  function label(key: string): string {
    return questions.find((question) => question.key === key)?.label ?? key;
  }

  if (!editable && rules.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Sums that must add up"
        description="Require a group of number questions to add up to a set value before a report can be submitted. A table column can be given its own total in the table settings."
      />
      <CardBody className="space-y-4">
        {rules.length === 0 ? (
          <p className="text-sm text-muted">No sum rules on this form.</p>
        ) : (
          <ul className="space-y-2" aria-label="Sum rules">
            {rules.map((rule) => {
              const first = questions.find((question) => question.key === rule.fields[0]);
              return (
                <li
                  key={rule.key}
                  className="flex items-start justify-between gap-3 rounded border border-line px-4 py-3 text-sm"
                >
                  <span>
                    {rule.fields.map(label).join(", ")} must add up to{" "}
                    {targetText(first?.type ?? "number", rule.target)}.
                  </span>
                  {editable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove the rule for ${rule.fields.map(label).join(", ")}`}
                      onClick={() => onChange(rules.filter((candidate) => candidate.key !== rule.key))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {editable ? (
          <div className="space-y-3 border-t border-line-soft pt-4">
            {candidates.length < 2 ? (
              <p className="text-sm text-muted">
                Add at least two number, whole number, dollar or percent questions to create a sum rule.
              </p>
            ) : (
              <>
                <fieldset>
                  <legend className="text-sm font-semibold text-ink">Questions that must add up</legend>
                  <Hint>Choose two or more questions of the same answer type.</Hint>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {candidates.map((question) => (
                      <li key={question.key}>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-line"
                            checked={picked.includes(question.key)}
                            onChange={(e) =>
                              setPicked(
                                e.target.checked
                                  ? [...picked, question.key]
                                  : picked.filter((key) => key !== question.key),
                              )
                            }
                          />
                          {question.label}
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-44">
                    <Label htmlFor={`${id}-kind`}>Must equal</Label>
                    <Select
                      id={`${id}-kind`}
                      value={kind}
                      onChange={(e) => setKind(e.target.value as "number" | "award")}
                    >
                      <option value="number">A fixed number</option>
                      <option value="award">The award</option>
                    </Select>
                  </div>
                  <div className="w-36">
                    <Label htmlFor={`${id}-value`}>Number</Label>
                    <Input
                      id={`${id}-value`}
                      type="number"
                      min={0}
                      step="any"
                      className="num"
                      value={kind === "award" ? "" : value}
                      disabled={kind === "award"}
                      onChange={(e) => setValue(e.target.value)}
                    />
                  </div>
                  <Button variant="secondary" onClick={add} disabled={hint !== null}>
                    Add sum rule
                  </Button>
                </div>
                {valueMessage ? (
                  <p role="alert" className="text-sm font-semibold text-bad">
                    {valueMessage}
                  </p>
                ) : hint && picked.length > 0 ? (
                  <p className="text-sm text-muted">{hint}</p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
