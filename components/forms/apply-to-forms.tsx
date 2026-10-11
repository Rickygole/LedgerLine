"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { applyLibraryQuestion } from "@/app/finance/question-library/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { Input, Label, Select } from "@/components/ui/field";
import { counted } from "@/lib/format";
import type { ApplyOutcome } from "@/lib/forms/library";

export type ApplyTarget = {
  id: string;
  code: string;
  name: string;
  fiscalYear: string;
  retired: boolean;
  hasForm: boolean;
};

type Props = {
  questionKey: string;
  questionLabel: string;
  targets: ApplyTarget[];
};

const RESULT_TEXT: Record<ApplyOutcome["result"], string> = {
  created: "New draft created",
  updated: "Open draft updated",
  added: "Added to the open draft",
  unchanged: "Already current",
  missing: "Question is not on this form",
  no_form: "No form to copy from",
  invalid: "Not applied",
};

export function ApplyToForms({ questionKey, questionLabel, targets }: Props) {
  const years = useMemo(() => [...new Set(targets.map((t) => t.fiscalYear))].sort().reverse(), [targets]);
  const [year, setYear] = useState(years[0] ?? "");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [addIfMissing, setAddIfMissing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<ApplyOutcome[] | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return targets.filter(
      (t) =>
        t.fiscalYear === year &&
        !t.retired &&
        (needle === "" || t.name.toLowerCase().includes(needle) || t.code.toLowerCase().includes(needle)),
    );
  }, [targets, year, search]);

  function toggle(id: string, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  }

  function apply() {
    startTransition(async () => {
      const result = await applyLibraryQuestion(questionKey, [...picked], addIfMissing);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setErrors([]);
      setOutcomes(result.outcomes);
      setPicked(new Set());
    });
  }

  const count = (result: ApplyOutcome["result"]) => outcomes?.filter((o) => o.result === result).length ?? 0;
  const drafts = count("created") + count("updated") + count("added");

  return (
    <Card>
      <CardHeader
        title="Apply to forms"
        description={`Create a new draft form version with the current "${questionLabel}" for each initiative you select. Published forms and reports already started are never changed. Review and publish each draft from the initiative.`}
      />
      <CardBody className="space-y-4">
        <ErrorSummary
          title={problemsTitle(errors.length, "you apply")}
          items={errors.map((message) => ({ message }))}
          className="mb-0"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Label htmlFor="apply-year">Fiscal year</Label>
            <Select id="apply-year" value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-56 flex-1">
            <Label htmlFor="apply-search">Find an initiative</Label>
            <Input
              id="apply-search"
              type="search"
              value={search}
              placeholder="Name or code"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => setPicked(new Set([...picked, ...shown.filter((t) => t.hasForm).map((t) => t.id)]))}
          >
            Select all shown
          </Button>
          <Button variant="secondary" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>
            Clear selection
          </Button>
        </div>
        <ul
          aria-label="Initiatives"
          className="max-h-72 divide-y divide-line-soft overflow-y-auto rounded border border-line"
        >
          {shown.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">No initiatives match.</li>
          ) : (
            shown.map((t) => (
              <li key={t.id} className="px-4 py-2">
                <label className="flex items-start gap-3 text-sm text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-line"
                    checked={picked.has(t.id)}
                    disabled={!t.hasForm}
                    onChange={(e) => toggle(t.id, e.target.checked)}
                  />
                  <span>
                    <span className="font-semibold">{t.name}</span>{" "}
                    <span className="ml-1 font-mono text-[13px] text-muted">{t.code}</span>
                    {t.hasForm ? null : (
                      <>
                        {" "}
                        <span className="ml-1 text-muted">No form yet</span>
                      </>
                    )}
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-line"
            checked={addIfMissing}
            onChange={(e) => setAddIfMissing(e.target.checked)}
          />
          Also add the question to forms that do not have it
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={apply} disabled={pending || picked.size === 0}>
            {pending ? "Applying" : `Apply to ${counted(picked.size, "form")}`}
          </Button>
          <span className="text-sm text-muted" aria-live="polite">
            {counted(picked.size, "initiative")} selected
          </span>
        </div>
        {outcomes ? (
          <div role="status" className="space-y-3 rounded border border-ok/30 bg-ok-bg px-4 py-3 text-sm text-ink">
            <p className="font-semibold text-ok">
              {counted(count("created"), "new draft")} created,{" "}
              {counted(count("updated") + count("added"), "open draft")} updated. {counted(drafts, "draft")} to review
              and publish.
            </p>
            {count("unchanged") + count("missing") + count("no_form") + count("invalid") > 0 ? (
              <p>
                Skipped: {count("unchanged")} already current, {count("missing")} without the question,{" "}
                {count("no_form")} without a form, {count("invalid")} that would not pass the form checks.
              </p>
            ) : null}
            <ul className="max-h-60 divide-y divide-line-soft overflow-y-auto rounded border border-line bg-white">
              {outcomes.map((o) => (
                <li key={o.initiativeId} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-1.5">
                  <Link
                    href={`/finance/initiatives/${o.initiativeId}`}
                    className="font-semibold text-link underline underline-offset-2 hover:text-link-hover"
                  >
                    {o.name}
                  </Link>
                  <span className="text-muted">
                    {RESULT_TEXT[o.result]}
                    {o.version ? `, version ${o.version}` : ""}
                    {o.detail ? `: ${o.detail}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
