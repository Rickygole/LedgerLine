"use client";

import { useActionState, useId, useRef } from "react";
import { KeyRound, UserCheck, UserX, X } from "lucide-react";
import { changeRole, sendPasswordReset, setActive, type UserActionState } from "@/app/finance/users/actions";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/field";

const ROLE_OPTIONS = [
  { value: "finance_viewer", label: "Finance (view only)" },
  { value: "finance_analyst", label: "Finance analyst" },
  { value: "finance_admin", label: "Finance administrator" },
];

function Message({ state }: { state: UserActionState }) {
  if (!state) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={`text-sm font-semibold ${state.error ? "text-bad" : "text-ok"}`}>
      {state.error ?? state.ok}
    </p>
  );
}

export function UserActions({ userId, name, email, role, active, isSelf, isCbo }: { userId: string; name: string; email: string; role: string; active: boolean; isSelf: boolean; isCbo: boolean }) {
  const [roleState, roleAction, rolePending] = useActionState(changeRole, undefined);
  const [activeState, activeAction, activePending] = useActionState(setActive, undefined);
  const [resetState, resetAction, resetPending] = useActionState(sendPasswordReset, undefined);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => ref.current?.close();
  return (
    <>
      <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        Manage<span className="sr-only"> {name}</span>
      </Button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="manage-dialog m-auto w-[min(30rem,calc(100vw-2rem))] max-w-none rounded border border-line bg-white p-0 text-ink"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink">
              Manage {name}
            </h2>
            <p className="mt-0.5 break-words text-sm text-muted">{email}</p>
          </div>
          <button type="button" onClick={close} className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted hover:bg-surface hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-5 px-5 py-5">
          {!isCbo ? (
            <form action={roleAction} className="space-y-2">
              <input type="hidden" name="userId" value={userId} />
              <Label htmlFor={`role-${userId}`}>Role</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Select id={`role-${userId}`} name="role" defaultValue={role} disabled={isSelf} className="w-auto min-w-56 flex-1">
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary" disabled={isSelf || rolePending}>
                  {rolePending ? "Saving" : "Save role"}
                </Button>
              </div>
              {isSelf ? <p className="text-sm text-muted">You cannot change your own role.</p> : null}
              <Message state={roleState} />
            </form>
          ) : null}
          <form action={activeAction} className="space-y-2 border-t border-line pt-5">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="active" value={active ? "false" : "true"} />
            <p className="text-sm text-muted">{active ? "Deactivating stops this person from signing in. Their history stays in the audit log." : "Activating lets this person sign in again."}</p>
            <Button type="submit" variant="secondary" disabled={(isSelf && active) || activePending}>
              {active ? <UserX className="h-4 w-4" aria-hidden="true" /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
              {active ? "Deactivate" : "Activate"}
              <span className="sr-only"> {name}</span>
            </Button>
            <Message state={activeState} />
          </form>
          <form action={resetAction} className="space-y-2 border-t border-line pt-5">
            <input type="hidden" name="userId" value={userId} />
            <p className="text-sm text-muted">A password reset link is added to the outbox for {email}.</p>
            <Button type="submit" variant="secondary" disabled={resetPending}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Send password reset
              <span className="sr-only"> to {name}</span>
            </Button>
            <Message state={resetState} />
          </form>
        </div>
      </dialog>
    </>
  );
}
