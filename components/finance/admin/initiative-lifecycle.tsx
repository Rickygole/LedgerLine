"use client";

import Link from "next/link";
import { useActionState } from "react";
import { renameInitiative, retireInitiative } from "@/app/finance/initiatives/[id]/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label } from "@/components/ui/field";
import { ErrorSummary } from "@/components/finance/admin/error-summary";

export function RenameInitiativeForm({ initiativeId, currentName }: { initiativeId: string; currentName: string }) {
  const [state, action, pending] = useActionState(renameInitiative, undefined);
  const fe = state?.fieldErrors ?? {};
  const summary = [
    ...(state?.error && Object.keys(fe).length === 0 ? [{ id: "", message: state.error }] : []),
    ...Object.entries(fe).map(([key, message]) => ({ id: `rename-${key}`, message })),
  ];
  return (
    <form key={state?.ok ? state.at : "form"} action={action} noValidate className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink">Rename</h3>
        <p className="mt-0.5 text-sm text-muted">
          The initiative keeps its code, awards and reports. The old name stays in its history and in the lineage.
        </p>
      </div>
      <ErrorSummary errors={summary} />
      {state?.ok ? (
        <p role="status" className="text-sm font-semibold text-ok">
          {state.ok}
        </p>
      ) : null}
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <div>
        <Label htmlFor="rename-name">New name</Label>
        <Input
          id="rename-name"
          name="name"
          maxLength={160}
          defaultValue={state?.values?.name ?? currentName}
          aria-required="true"
          aria-invalid={fe.name ? true : undefined}
        />
        <FieldError>{fe.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="rename-reason">Reason</Label>
        <Hint>Recorded in the audit log and the lineage.</Hint>
        <Input
          id="rename-reason"
          name="reason"
          maxLength={300}
          defaultValue={state?.values?.reason}
          aria-required="true"
          aria-invalid={fe.reason ? true : undefined}
        />
        <FieldError>{fe.reason}</FieldError>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Renaming" : "Rename initiative"}
      </Button>
    </form>
  );
}

export function RetireInitiativeForm({ initiativeId }: { initiativeId: string }) {
  const [state, action, pending] = useActionState(retireInitiative, undefined);
  const fe = state?.fieldErrors ?? {};
  const summary = [
    ...(state?.error && Object.keys(fe).length === 0 ? [{ id: "", message: state.error }] : []),
    ...Object.entries(fe).map(([key, message]) => ({ id: `retire-${key}`, message })),
  ];
  return (
    <form action={action} noValidate className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink">Retire</h3>
        <p className="mt-0.5 text-sm text-muted">
          A retired initiative accepts no new reports and drops out of reminders. Everything already reported stays on
          record.
        </p>
      </div>
      <ErrorSummary errors={summary} />
      {state?.ok ? (
        <p role="status" className="text-sm font-semibold text-ok">
          {state.ok}
        </p>
      ) : null}
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <div>
        <Label htmlFor="retire-reason">Reason</Label>
        <Hint>Recorded in the audit log and the lineage.</Hint>
        <Input
          id="retire-reason"
          name="reason"
          maxLength={300}
          defaultValue={state?.values?.reason}
          aria-required="true"
          aria-invalid={fe.reason ? true : undefined}
        />
        <FieldError>{fe.reason}</FieldError>
      </div>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Retiring" : "Retire initiative"}
      </Button>
    </form>
  );
}

export function CombineLink() {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-bold text-ink">Combine</h3>
      <p className="text-sm text-muted">
        Combining initiatives happens at the annual rollover, where two or more initiatives become one in the new fiscal
        year and each keeps a lineage link to it.
      </p>
      <Link
        href="/finance/rollover"
        className="inline-block text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover"
      >
        Go to annual rollover
      </Link>
    </div>
  );
}
