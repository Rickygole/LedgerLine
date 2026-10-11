"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";
import { renameInitiative, retireInitiative } from "@/app/finance/initiatives/[id]/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label } from "@/components/ui/field";
import { ErrorSummary } from "@/components/finance/admin/error-summary";
import { plural } from "@/lib/format";

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

const DANGER_OUTLINE =
  "text-bad shadow-[inset_0_0_0_2px_var(--color-bad)] hover:text-bad hover:shadow-[inset_0_0_0_2px_var(--color-bad)] hover:bg-bad/5 active:text-bad";

export function RetireInitiativeForm({
  initiativeId,
  name,
  organizations,
}: {
  initiativeId: string;
  name: string;
  organizations: number;
}) {
  const [state, action, pending] = useActionState(retireInitiative, undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (state) dialog.current?.close();
  }, [state]);
  const fe = state?.fieldErrors ?? {};
  const summary = [
    ...(state?.error && Object.keys(fe).length === 0 ? [{ id: "", message: state.error }] : []),
    ...Object.entries(fe).map(([key, message]) => ({ id: `retire-${key}`, message })),
  ];
  return (
    <form action={action} noValidate className="space-y-4">
      <p className="max-w-[70ch] text-sm text-muted">
        A retired initiative accepts no new reports and drops out of reminders. Everything already reported stays on
        record.
      </p>
      <ErrorSummary errors={summary} />
      {state?.ok ? (
        <p role="status" className="text-sm font-semibold text-ok">
          {state.ok}
        </p>
      ) : null}
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <div className="max-w-xl">
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
      <Button
        type="button"
        variant="secondary"
        className={DANGER_OUTLINE}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        Retire initiative
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="manage-dialog m-auto w-[min(30rem,calc(100vw-2rem))] max-w-none rounded border border-line bg-white p-0 text-left text-ink"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="space-y-3 px-5 py-5">
          <h2 id={titleId} className="text-lg font-bold text-ink">
            Retire {name}?
          </h2>
          <p className="text-[15px] leading-6 text-ink">
            {organizations === 0
              ? "No organizations are funded through this initiative. "
              : `${organizations} ${plural(organizations, "organization")} will stop receiving reports and reminders for this initiative. `}
            Reports already submitted stay on record. This cannot be undone.
          </p>
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Retiring" : "Yes, retire it"}
            </Button>
          </div>
        </div>
      </dialog>
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
