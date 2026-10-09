"use client";

import { useActionState, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { signIn } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

type Account = { name: string; role: string; email: string; chip: string; tone: "org" | "finance" | "admin" };

const CHIP: Record<Account["tone"], string> = {
  org: "bg-ok-bg text-ok ring-ok/20",
  finance: "bg-info-bg text-info ring-info/20",
  admin: "bg-navy-800 text-white ring-navy-900",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function LoginForm({ accounts }: { accounts: Account[] }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const [chosen, setChosen] = useState<string | null>(null);

  const choose = (email: string) => {
    if (emailRef.current) emailRef.current.value = email;
    setChosen(email);
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

      <section aria-labelledby="demo-accounts" className="mt-10 overflow-hidden rounded-xl border border-line bg-white shadow-card">
        <div className="border-b border-line bg-surface px-4 py-3">
          <h2 id="demo-accounts" className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Demonstration accounts
          </h2>
          <p className="mt-0.5 text-xs text-muted">Choose an account, then enter the demo password.</p>
        </div>
        <ul className="divide-y divide-line">
          {accounts.map((account) => {
            const selected = chosen === account.email;
            return (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => choose(account.email)}
                  aria-pressed={selected}
                  aria-label={`Sign in as ${account.name}, ${account.chip}`}
                  className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-navy-50 focus-visible:-outline-offset-2 aria-pressed:bg-navy-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-bold text-navy-800" aria-hidden="true">
                    {initials(account.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-ink">{account.name}</span>
                      <span className={`inline-flex rounded-full px-2 py-px text-[11px] font-semibold ring-1 ring-inset ${CHIP[account.tone]}`}>{account.chip}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{account.role}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-navy-700 sm:inline-flex">
                    {selected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                    {selected ? "Selected" : `Sign in as ${account.name.split(" ")[0]}`}
                    {selected ? null : <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
                  </span>
                  <span className="shrink-0 sm:hidden">
                    {selected ? <Check className="h-4 w-4 text-navy-700" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-navy-700" aria-hidden="true" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
