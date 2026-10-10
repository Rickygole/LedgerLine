"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/actions";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  submitLabel,
  pendingLabel,
  children,
  hidden,
  variant = "primary",
  size = "md",
  className,
  resetOnSuccess = true,
  inline = false,
}: {
  action: Action;
  submitLabel: string;
  pendingLabel?: string;
  children?: React.ReactNode;
  hidden?: Record<string, string>;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  className?: string;
  resetOnSuccess?: boolean;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className ?? (inline ? "flex flex-wrap items-end gap-3" : "space-y-4")}
    >
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {state?.error ? (
        <p role="alert" className="rounded border border-bad bg-bad-bg px-3 py-2 text-sm font-semibold text-bad">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p role="status" className="rounded border border-ok bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">
          {state.ok}
        </p>
      ) : null}
      {children}
      <div>
        <Button type="submit" variant={variant} size={size} disabled={pending}>
          {pending ? (pendingLabel ?? "Saving") : submitLabel}
        </Button>
      </div>
    </form>
  );
}
