"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);

  return (
    <form action={action} className="mt-6 space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state?.error ? (
        <div role="alert" className="border-l-4 border-bad bg-bad-bg px-4 py-3 text-sm font-semibold text-ink">
          {state.error}
        </div>
      ) : null}
      <div>
        <Label htmlFor="email">Work email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" defaultValue={state?.values?.email} required aria-invalid={state?.fieldErrors?.email ? true : undefined} aria-describedby={state?.fieldErrors?.email ? "email-error" : undefined} />
        <FieldError id="email-error">{state?.fieldErrors?.email}</FieldError>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={state?.fieldErrors?.password ? true : undefined} aria-describedby={state?.fieldErrors?.password ? "password-error" : undefined} />
        <FieldError id="password-error">{state?.fieldErrors?.password}</FieldError>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>
      <p className="text-sm">
        <Link href="/help#sign-in" className="text-link underline underline-offset-2 hover:text-link-hover">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
