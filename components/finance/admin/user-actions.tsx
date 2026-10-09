"use client";

import { useActionState } from "react";
import { KeyRound, UserCheck, UserX } from "lucide-react";
import { changeRole, sendPasswordReset, setActive, type UserActionState } from "@/app/finance/users/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

const ROLE_OPTIONS = [
  { value: "finance_viewer", label: "Finance (view only)" },
  { value: "finance_analyst", label: "Finance analyst" },
  { value: "finance_admin", label: "Finance administrator" },
];

function Message({ state }: { state: UserActionState }) {
  if (!state) return null;
  return (
    <div role={state.error ? "alert" : "status"} className={`text-xs font-semibold ${state.error ? "text-bad" : "text-ok"}`}>
      <p>{state.error ?? state.ok}</p>
      {state.link ? <code data-testid="issued-link" className="mt-1 block break-all font-mono font-normal text-ink">{state.link}</code> : null}
    </div>
  );
}

export function UserActions({ userId, name, role, active, isSelf, isCbo }: { userId: string; name: string; role: string; active: boolean; isSelf: boolean; isCbo: boolean }) {
  const [roleState, roleAction, rolePending] = useActionState(changeRole, undefined);
  const [activeState, activeAction, activePending] = useActionState(setActive, undefined);
  const [resetState, resetAction, resetPending] = useActionState(sendPasswordReset, undefined);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!isCbo ? (
          <form action={roleAction} className="flex items-center gap-2">
            <input type="hidden" name="userId" value={userId} />
            <label htmlFor={`role-${userId}`} className="sr-only">
              Role for {name}
            </label>
            <Select id={`role-${userId}`} name="role" defaultValue={role} disabled={isSelf} className="h-8 w-52 py-1">
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <Button type="submit" size="sm" variant="secondary" disabled={isSelf || rolePending}>
              Save role
            </Button>
          </form>
        ) : null}
        <form action={activeAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="active" value={active ? "false" : "true"} />
          <Button type="submit" size="sm" variant="secondary" disabled={(isSelf && active) || activePending}>
            {active ? <UserX className="h-3.5 w-3.5" aria-hidden="true" /> : <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />}
            {active ? "Deactivate" : "Activate"}
            <span className="sr-only"> {name}</span>
          </Button>
        </form>
        <form action={resetAction}>
          <input type="hidden" name="userId" value={userId} />
          <Button type="submit" size="sm" variant="ghost" disabled={resetPending}>
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            Send password reset
            <span className="sr-only"> to {name}</span>
          </Button>
        </form>
      </div>
      <Message state={roleState} />
      <Message state={activeState} />
      <Message state={resetState} />
    </div>
  );
}
