"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Flag, Pencil } from "lucide-react";
import { addFlagAction, correctionAction, transitionAction } from "@/app/finance/submissions/[id]/actions";
import { RequestUpdate } from "@/components/finance/review/request-update";
import { StaleNotice, isStale } from "@/components/finance/review/stale-notice";
import type { ActionResult, ActionState } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import type { Concern } from "@/lib/finance/review/return-note-core";
import {
  BudgetEditor,
  TableEditor,
  type BudgetLineDraft,
  type CorrectableQuestion,
  type TableRowDraft,
} from "@/components/finance/review/correction-editors";

export type { CorrectableQuestion };

function draftFor(question: CorrectableQuestion | undefined): string {
  if (!question) return "";
  if (question.kind === "value") return question.current;
  if (question.kind === "table") return JSON.stringify(question.rows);
  return JSON.stringify(question.lines);
}

function Message({ state }: { state: ActionState }) {
  if (!state) return <div aria-live="polite" />;
  if (state.error && isStale(state.error)) return <StaleNotice />;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={state.error ? "text-sm font-semibold text-bad" : "text-sm font-semibold text-ok"}
    >
      {state.error ?? state.ok}
    </p>
  );
}

function TransitionButton({
  submissionId,
  lockVersion,
  action,
  label,
  variant,
  onDone,
}: {
  submissionId: string;
  lockVersion: number;
  action: "start_review" | "accept";
  label: string;
  variant: "primary" | "secondary" | "ghost";
  onDone: (message: string) => void;
}) {
  const [state, formAction, pending] = useActionState(async (previous: ActionState, formData: FormData) => {
    const result = await transitionAction(previous, formData);
    if (result.ok) onDone(result.ok);
    return result;
  }, undefined);
  return (
    <form action={formAction} className={variant === "ghost" ? "inline-flex flex-col" : "space-y-2"}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="lockVersion" value={lockVersion} />
      <input type="hidden" name="action" value={action} />
      <Button
        type="submit"
        variant={variant}
        className={variant === "ghost" ? "px-0" : "h-11 w-full text-base"}
        disabled={pending}
      >
        {pending ? "Working" : label}
      </Button>
      {state?.ok ? null : <Message state={state} />}
    </form>
  );
}

function useGuardedAction(run: (fd: FormData) => Promise<ActionResult>) {
  const [state, setState] = useState<ActionState>();
  const [pending, startTransition] = useTransition();
  const submit = (fd: FormData, onOk: () => void) => {
    startTransition(async () => {
      const result = await run(fd);
      setState(result);
      if (result.ok) onOk();
    });
  };
  return { state, pending, submit };
}

function FlagForm({ submissionId }: { submissionId: string }) {
  const [note, setNote] = useState("");
  const { state, pending, submit } = useGuardedAction((fd) => addFlagAction(undefined, fd));
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData();
        fd.set("submissionId", submissionId);
        fd.set("note", note);
        submit(fd, () => setNote(""));
      }}
    >
      <Label htmlFor="flag-note">Flag note</Label>
      <Textarea
        id="flag-note"
        aria-required="true"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-describedby={state?.error ? "flag-error" : undefined}
        aria-invalid={state?.error ? true : undefined}
      />
      {state?.error ? <FieldError id="flag-error">{state.error}</FieldError> : null}
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Flag className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding" : "Add manual flag"}
      </Button>
      {state?.ok ? <Message state={state} /> : null}
    </form>
  );
}

function CorrectionForm({
  submissionId,
  lockVersion,
  questions,
}: {
  submissionId: string;
  lockVersion: number;
  questions: CorrectableQuestion[];
}) {
  const [question, setQuestion] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const { state, pending, submit } = useGuardedAction((fd) => correctionAction(undefined, fd));
  const selected = questions.find((q) => q.key === question);
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData();
        fd.set("submissionId", submissionId);
        fd.set("lockVersion", String(lockVersion));
        fd.set("questionKey", question);
        fd.set("value", value);
        fd.set("reason", reason);
        submit(fd, () => {
          setQuestion("");
          setValue("");
          setReason("");
        });
      }}
    >
      <div>
        <Label htmlFor="corr-question">Question</Label>
        <Select
          id="corr-question"
          aria-required="true"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            setValue(draftFor(questions.find((q) => q.key === event.target.value)));
          }}
        >
          <option value="" disabled>
            Choose a question
          </option>
          {questions.map((q) => (
            <option key={q.key} value={q.key}>
              {q.label}
            </option>
          ))}
        </Select>
      </div>
      {selected && selected.kind === "table" ? (
        <div>
          <p className="mb-1 text-sm font-semibold text-ink">Rows</p>
          <TableEditor
            columns={selected.columns}
            rows={JSON.parse(value || "[]") as TableRowDraft[]}
            maxRows={selected.maxRows}
            onChange={(rows) => setValue(JSON.stringify(rows))}
          />
        </div>
      ) : selected && selected.kind === "budget" ? (
        <div>
          <p className="mb-1 text-sm font-semibold text-ink">Budget lines</p>
          <BudgetEditor
            lines={JSON.parse(value || "[]") as BudgetLineDraft[]}
            maxLines={selected.maxLines}
            onChange={(lines) => setValue(JSON.stringify(lines))}
          />
        </div>
      ) : (
        <div>
          <Label htmlFor="corr-value">New value</Label>
          <Input
            id="corr-value"
            aria-required="true"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>
      )}
      <div>
        <Label htmlFor="corr-reason">Reason</Label>
        <Textarea
          id="corr-reason"
          aria-required="true"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-describedby={state?.error ? "corr-error" : undefined}
          aria-invalid={state?.error ? true : undefined}
        />
      </div>
      {state?.error && isStale(state.error) ? <StaleNotice /> : null}
      <div role="alert" aria-atomic="true">
        {state?.error && !isStale(state.error) ? <FieldError id="corr-error">{state.error}</FieldError> : null}
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
        {pending ? "Saving" : "Save correction"}
      </Button>
      {state?.ok ? <Message state={state} /> : null}
    </form>
  );
}

export function ActionsPanel({
  submissionId,
  status,
  lockVersion,
  concerns,
  questions,
  badge,
  orgName,
  contactName,
  prefill,
  since,
}: {
  submissionId: string;
  status: string;
  lockVersion: number;
  concerns: Concern[];
  questions: CorrectableQuestion[];
  badge?: React.ReactNode;
  orgName: string;
  contactName: string | null;
  prefill: string;
  since: string | null;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const correctable = status === "submitted" || status === "under_review" || status === "accepted";
  const common = { submissionId, lockVersion, onDone: setNotice };
  return (
    <section aria-labelledby="decision-title" className="rounded border border-line bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 pb-4 pt-5">
        <h2 id="decision-title" className="text-xl font-bold leading-7 text-ink">
          Your decision
        </h2>
        {badge}
      </div>
      <div className="space-y-4 px-5 py-5">
        <div aria-live="polite">
          {notice ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded border border-ok/25 bg-ok-bg px-3 py-2 text-[15px] font-semibold text-ok"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {notice}
            </p>
          ) : null}
        </div>
        {status === "submitted" ? (
          <div className="space-y-3">
            <TransitionButton {...common} action="start_review" label="Start review" variant="primary" />
            <p className="text-sm text-ink-2">Starting review tells the organization their report is being reviewed.</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line-soft pt-3 text-sm">
              <span className="w-full text-muted">Or decide now:</span>
              <TransitionButton {...common} action="accept" label="Accept report" variant="ghost" />
              <RequestUpdate
                {...common}
                concerns={concerns}
                contactName={contactName}
                prefill={prefill}
                variant="ghost"
              />
            </div>
          </div>
        ) : status === "under_review" ? (
          <div className="space-y-3">
            <TransitionButton {...common} action="accept" label="Accept report" variant="primary" />
            <RequestUpdate {...common} concerns={concerns} contactName={contactName} prefill={prefill} />
          </div>
        ) : (
          <p className="rounded bg-surface px-3 py-2.5 text-[15px] text-ink-2">
            {status === "accepted"
              ? `This report is accepted${since ? `. ${since}` : ""}. You can still correct an answer or add a flag.`
              : status === "returned"
                ? `Waiting on ${orgName}${since ? ` since ${since}` : ""} to update and resubmit.`
                : "This report has not been submitted yet."}
          </p>
        )}
        {status !== "draft" ? (
          <details className="group border-t border-line-soft pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-[15px] font-semibold text-link underline underline-offset-2 [&::-webkit-details-marker]:hidden">
              <Flag className="h-4 w-4" aria-hidden="true" />
              Add a manual flag
            </summary>
            <div className="mt-3">
              <FlagForm submissionId={submissionId} />
            </div>
          </details>
        ) : null}
        {correctable ? (
          <details className="group border-t border-line-soft pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-[15px] font-semibold text-link underline underline-offset-2 [&::-webkit-details-marker]:hidden">
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Correct an answer
            </summary>
            <p className="mt-2 text-sm text-muted">
              Creates a new revision under your name. The status does not change.
            </p>
            <div className="mt-3">
              <CorrectionForm submissionId={submissionId} lockVersion={lockVersion} questions={questions} />
            </div>
          </details>
        ) : null}
        <p className="border-t border-line-soft pt-3 text-[13px] text-muted">
          Every action is recorded in the audit timeline under your name.
        </p>
      </div>
    </section>
  );
}
