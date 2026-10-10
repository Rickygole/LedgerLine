"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { addCustomReport, removeCustomReport, setRequiredReport } from "@/app/finance/initiatives/[id]/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label } from "@/components/ui/field";
import { ErrorSummary } from "@/components/finance/admin/error-summary";

export function RequiredReportToggle({
  initiativeId,
  periodId,
  label,
  required,
  disabled,
  disabledReason,
}: {
  initiativeId: string;
  periodId: string;
  label: string;
  required: boolean;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState(setRequiredReport, undefined);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <input type="hidden" name="periodId" value={periodId} />
      <input type="hidden" name="required" value={required ? "false" : "true"} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || disabled} title={disabledReason}>
        {required ? "Remove" : "Add back"}
        <span className="sr-only"> {label}</span>
      </Button>
      {state?.error ? (
        <div role="alert">
          <FieldError>{state.error}</FieldError>
        </div>
      ) : null}
    </form>
  );
}

export function CustomReportRemove({
  initiativeId,
  periodId,
  label,
  disabled,
  disabledReason,
}: {
  initiativeId: string;
  periodId: string;
  label: string;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState(removeCustomReport, undefined);
  return (
    <form action={action} className="space-y-1">
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <input type="hidden" name="periodId" value={periodId} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending || disabled} title={disabledReason}>
        Delete
        <span className="sr-only"> {label}</span>
      </Button>
      {state?.error ? (
        <div role="alert">
          <FieldError>{state.error}</FieldError>
        </div>
      ) : null}
    </form>
  );
}

export function AddCustomReportForm({ initiativeId }: { initiativeId: string }) {
  const [state, action, pending] = useActionState(addCustomReport, undefined);
  const fe = state?.fieldErrors ?? {};
  const summary = [
    ...(state?.error && Object.keys(fe).length === 0 ? [{ id: "", message: state.error }] : []),
    ...Object.entries(fe).map(([key, message]) => ({ id: `custom-${key}`, message })),
  ];
  return (
    <form
      key={state?.ok ? state.at : "form"}
      action={action}
      noValidate
      className="space-y-4 border-t border-line-soft px-6 py-5"
    >
      <h3 className="text-base font-bold text-ink">Add a custom report</h3>
      <p className="-mt-2 text-sm text-muted">
        A report only this initiative requires, with its own name and due date. Funded organizations get it with the
        same form as the standard reports.
      </p>
      <ErrorSummary errors={summary} />
      {state?.ok ? (
        <p role="status" className="text-sm font-semibold text-ok">
          {state.ok}
        </p>
      ) : null}
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <Label htmlFor="custom-label">Report name</Label>
          <Input
            id="custom-label"
            name="label"
            maxLength={80}
            defaultValue={state?.values?.label}
            aria-required="true"
            aria-invalid={fe.label ? true : undefined}
          />
          <FieldError>{fe.label}</FieldError>
        </div>
        <div>
          <Label htmlFor="custom-due">Due date</Label>
          <Input
            id="custom-due"
            name="due"
            type="date"
            defaultValue={state?.values?.due}
            aria-required="true"
            aria-invalid={fe.due ? true : undefined}
          />
          <FieldError>{fe.due}</FieldError>
        </div>
        <div className="md:col-span-4">
          <Hint>Period covered. Leave both blank to cover the fiscal year up to the due date.</Hint>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:max-w-xl">
            <div>
              <Label htmlFor="custom-starts" optional>
                Covers from
              </Label>
              <Input id="custom-starts" name="starts" type="date" defaultValue={state?.values?.starts} />
            </div>
            <div>
              <Label htmlFor="custom-ends" optional>
                Covers to
              </Label>
              <Input id="custom-ends" name="ends" type="date" defaultValue={state?.values?.ends} />
            </div>
          </div>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending ? "Adding" : "Add report"}
      </Button>
    </form>
  );
}
