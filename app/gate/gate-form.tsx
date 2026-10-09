"use client";

import { useActionState } from "react";
import { unlockGate } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

export function GateForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(unlockGate, undefined);
  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="next" value={next} />
      <div className={state?.error ? "border-l-4 border-bad pl-4" : undefined}>
        <Label htmlFor="passcode">Passcode</Label>
        <FieldError id="passcode-error" className="mb-1.5 mt-0">{state?.error}</FieldError>
        <Input id="passcode" name="passcode" type="password" autoComplete="off" autoFocus required aria-invalid={state?.error ? true : undefined} aria-describedby={state?.error ? "passcode-error" : undefined} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Checking" : "Continue"}
      </Button>
    </form>
  );
}
