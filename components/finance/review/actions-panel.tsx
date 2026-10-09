"use client";

import { useActionState } from "react";
import { CheckCircle2, Eye, Flag, Pencil } from "lucide-react";
import { addFlagAction, correctionAction, transitionAction, type ActionResult } from "@/app/finance/submissions/[id]/actions";
import { RequestUpdate } from "@/components/finance/review/request-update";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import type { Concern } from "@/lib/finance/review/return-note-core";

export type CorrectableQuestion = { key: string; label: string; current: string };

function Message({ state }: { state: ActionResult | undefined }) {
  if (!state) return <div aria-live="polite" />;
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

function FlagForm({ submissionId }: { submissionId: string }) {
  const [state, action, pending] = useActionState(addFlagAction, undefined);
  return (
    <form action={action} className="space-y-2" key={state?.ok ? "added" : "open"}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <Label htmlFor="flag-note" required>
        Flag note
      </Label>
      <Textarea id="flag-note" name="note" rows={3} required aria-describedby={state && !state.ok ? "flag-error" : undefined} aria-invalid={state && !state.ok ? true : undefined} />
      {state && !state.ok ? <FieldError id="flag-error">{state.message}</FieldError> : null}
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <Flag className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding" : "Add manual flag"}
      </Button>
      {state?.ok ? <Message state={state} /> : null}
    </form>
  );
}

function CorrectionForm({ submissionId, questions }: { submissionId: string; questions: CorrectableQuestion[] }) {
  const [state, action, pending] = useActionState(correctionAction, undefined);
  return (
    <form action={action} className="space-y-2" key={state?.ok ? "corrected" : "open"}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <div>
        <Label htmlFor="corr-question" required>
          Question
        </Label>
        <Select
          id="corr-question"
          name="questionKey"
          required
          defaultValue=""
          onChange={(event) => {
            const input = document.getElementById("corr-value") as HTMLInputElement | null;
            const current = questions.find((q) => q.key === event.target.value)?.current ?? "";
            if (input) input.value = current;
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
        <Input id="corr-value" name="value" />
      </div>
      <div>
        <Label htmlFor="corr-reason" required>
          Reason
        </Label>
        <Textarea id="corr-reason" name="reason" rows={2} required aria-describedby={state && !state.ok ? "corr-error" : undefined} aria-invalid={state && !state.ok ? true : undefined} />
      </div>
      {state && !state.ok ? <FieldError id="corr-error">{state.message}</FieldError> : null}
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
}: {
  submissionId: string;
  status: string;
  lockVersion: number;
  concerns: Concern[];
  questions: CorrectableQuestion[];
}) {
  const reviewable = status === "submitted" || status === "under_review";
  const correctable = reviewable || status === "accepted";
  return (
    <Card>
      <CardHeader title="Actions" description="Every action is recorded in the audit timeline." />
      <CardBody className="space-y-5">
        {reviewable ? (
          <div className="space-y-3">
            {status === "submitted" ? <TransitionButton submissionId={submissionId} lockVersion={lockVersion} action="start_review" label="Start review" icon={Eye} variant="primary" /> : null}
            <TransitionButton submissionId={submissionId} lockVersion={lockVersion} action="accept" label="Accept" icon={CheckCircle2} variant={status === "under_review" ? "primary" : "secondary"} />
            <RequestUpdate submissionId={submissionId} lockVersion={lockVersion} concerns={concerns} />
          </div>
        ) : (
          <p className="text-sm text-muted">
            {status === "accepted" ? "This report is accepted. You can still correct an answer or add a flag." : status === "returned" ? "Waiting on the organization to update and resubmit." : "This report has not been submitted yet."}
          </p>
        )}
        <details className="border-t border-line pt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink">Add manual flag</summary>
          <div className="mt-3">
            <FlagForm submissionId={submissionId} />
          </div>
        </details>
        {correctable ? (
          <details className="border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Correct an answer</summary>
            <p className="mt-2 text-sm text-muted">Creates a new revision under your name. The status does not change.</p>
            <div className="mt-3">
              <CorrectionForm submissionId={submissionId} questions={questions} />
            </div>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}
