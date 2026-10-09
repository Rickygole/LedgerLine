"use client";

import { useActionState } from "react";
import { setPassword } from "@/app/reset/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label } from "@/components/ui/field";

export function ResetForm({ token, email }: { token: string; email: string }) {
  const [state, action, pending] = useActionState(setPassword, undefined);
  const error = state?.fieldErrors?.password;
  return (
    <form action={action} className="mt-8 space-y-5" noValidate>
      <input type="hidden" name="token" value={token} />
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      {state?.error ? (
        <div role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">
          {state.error}
        </div>
      ) : null}
      <div>
        <Label htmlFor="password">New password</Label>
        <Hint id="password-hint">At least 12 characters. It cannot be your email address.</Hint>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required aria-invalid={error ? true : undefined} aria-describedby={error ? "password-hint password-error" : "password-hint"} />
        <FieldError id="password-error">{error}</FieldError>
      </div>
      <div>
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving" : "Save password"}
      </Button>
    </form>
  );
}
