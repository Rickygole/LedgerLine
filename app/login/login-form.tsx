"use client";

import { useActionState, useRef } from "react";
import { signIn } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

type Account = { name: string; role: string; email: string };

export function LoginForm({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const choose = (email: string) => {
    if (emailRef.current) emailRef.current.value = email;
    passwordRef.current?.focus();
  };

  return (
    <>
      <form action={action} className="mt-8 space-y-5" noValidate>
        {state?.error ? (
          <div role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">
            {state.error}
          </div>
        ) : null}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input ref={emailRef} id="email" name="email" type="email" autoComplete="username" required aria-invalid={state?.fieldErrors?.email ? true : undefined} aria-describedby={state?.fieldErrors?.email ? "email-error" : undefined} />
          <FieldError id="email-error">{state?.fieldErrors?.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input ref={passwordRef} id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={state?.fieldErrors?.password ? true : undefined} aria-describedby={state?.fieldErrors?.password ? "password-error" : undefined} />
          <FieldError id="password-error">{state?.fieldErrors?.password}</FieldError>
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in" : "Sign in"}
        </Button>
      </form>

      <div className="mt-10 rounded-lg border border-line bg-white">
        <p className="border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted">Demonstration accounts</p>
        <ul className="divide-y divide-line">
          {accounts.map((account) => (
            <li key={account.email}>
              <button type="button" onClick={() => choose(account.email)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-navy-50">
                <span>
                  <span className="block text-sm font-semibold text-ink">{account.name}</span>
                  <span className="block text-xs text-muted">{account.role}</span>
                </span>
                <span className="text-xs font-semibold text-navy-700">Use</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
