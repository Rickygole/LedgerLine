"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, Eye, Flag, Pencil } from "lucide-react";
import { addFlagAction, correctionAction, transitionAction, type ActionResult } from "@/app/finance/submissions/[id]/actions";
import { RequestUpdate } from "@/components/finance/review/request-update";
import { StaleNotice, isStale } from "@/components/finance/review/stale-notice";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import type { Concern } from "@/lib/finance/review/return-note-core";

export type CorrectableQuestion = { key: string; label: string; current: string };

function Message({ state }: { state: ActionResult | undefined }) {
  if (!state) return <div aria-live="polite" />;
  if (!state.ok && isStale(state.message)) return <StaleNotice />;
  return (
    <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm font-semibold text-ok" : "text-sm font-semibold text-bad"}>
      {state.message}
    </p>
  );
}

function TransitionButton({ submissionId, lockVersion, action, label, icon: Icon, variant }: { submissionId: string; lockVersion: number; action: "start_review" | "accept"; label: string; icon: typeof Eye; variant: "primary" | "secondary" }) {
  const [state, formAction, pending] = useActionState(transitionAction, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="lockVersion" value={lockVersion} />
      <input type="hidden" name="action" value={action} />
      <Button type="submit" variant={variant} className="w-full" disabled={pending}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {pending ? "Working" : label}
      </Button>
      <Message state={state} />
    </form>
  );
}

function useGuardedAction(run: (fd: FormData) => Promise<ActionResult>) {
  const [state, setState] = useState<ActionResult | undefined>();
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
      <Label htmlFor="flag-note" required>
        Flag note
      </Label>
      <Textarea id="flag-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={state && !state.ok ? "flag-error" : undefined} aria-invalid={state && !state.ok ? true : undefined} />
      {state && !state.ok ? <FieldError id="flag-error">{state.message}</FieldError> : null}
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Flag className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding" : "Add manual flag"}
      </Button>
      {state?.ok ? <Message state={state} /> : null}
    </form>
  );
}

function CorrectionForm({ submissionId, lockVersion, questions }: { submissionId: string; lockVersion: number; questions: CorrectableQuestion[] }) {
  const [question, setQuestion] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const { state, pending, submit } = useGuardedAction((fd) => correctionAction(undefined, fd));
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
        <Label htmlFor="corr-question" required>
          Question
        </Label>
        <Select
          id="corr-question"
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            setValue(questions.find((q) => q.key === event.target.value)?.current ?? "");
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
      <div>
        <Label htmlFor="corr-value" required>
          New value
        </Label>
        <Input id="corr-value" value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
      <div>
        <Label htmlFor="corr-reason" required>
          Reason
        </Label>
        <Textarea id="corr-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} aria-describedby={state && !state.ok ? "corr-error" : undefined} aria-invalid={state && !state.ok ? true : undefined} />
      </div>
      {state && !state.ok ? isStale(state.message) ? <StaleNotice /> : <FieldError id="corr-error">{state.message}</FieldError> : null}
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
}: {
  submissionId: string;
  status: string;
  lockVersion: number;
  concerns: Concern[];
  questions: CorrectableQuestion[];
  badge?: React.ReactNode;
}) {
  const reviewable = status === "submitted" || status === "under_review";
  const correctable = reviewable || status === "accepted";
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-semibold text-ink">Actions</h2>
        {badge}
      </div>
      <CardBody className="space-y-4">
        {reviewable ? (
          <div className="space-y-2.5">
            {status === "submitted" ? <TransitionButton submissionId={submissionId} lockVersion={lockVersion} action="start_review" label="Start review" icon={Eye} variant="primary" /> : null}
            <TransitionButton submissionId={submissionId} lockVersion={lockVersion} action="accept" label="Accept report" icon={CheckCircle2} variant={status === "under_review" ? "primary" : "secondary"} />
            <RequestUpdate submissionId={submissionId} lockVersion={lockVersion} concerns={concerns} />
          </div>
        ) : (
          <p className="rounded-md bg-surface px-3 py-2.5 text-sm text-muted">
            {status === "accepted" ? "This report is accepted. You can still correct an answer or add a flag." : status === "returned" ? "Waiting on the organization to update and resubmit." : "This report has not been submitted yet."}
          </p>
        )}
        <p className="text-xs text-muted">Every action is recorded in the audit timeline under your name.</p>
        {status !== "draft" ? (
          <details className="group border-t border-line pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <Flag className="h-4 w-4 text-muted" aria-hidden="true" />
              Add a manual flag
            </summary>
            <div className="mt-3">
              <FlagForm submissionId={submissionId} />
            </div>
          </details>
        ) : null}
        {correctable ? (
          <details className="group border-t border-line pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
              <Pencil className="h-4 w-4 text-muted" aria-hidden="true" />
              Correct an answer
            </summary>
            <p className="mt-2 text-[13px] text-muted">Creates a new revision under your name. The status does not change.</p>
            <div className="mt-3">
              <CorrectionForm submissionId={submissionId} lockVersion={lockVersion} questions={questions} />
            </div>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}
