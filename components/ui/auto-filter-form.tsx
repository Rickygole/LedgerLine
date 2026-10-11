"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

const SEARCH_DELAY = 300;

function isTyped(el: HTMLInputElement) {
  return ["text", "search", "email", "tel", "url", "number", ""].includes(el.type);
}

export function AutoFilterForm({
  action,
  label = "Filter results",
  className,
  children,
}: {
  action: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = () => {
    if (timer.current) clearTimeout(timer.current);
    form.current?.requestSubmit();
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <Form
      ref={form}
      action={action}
      role="search"
      aria-label={label}
      className={className}
      onChange={(event) => {
        const el = event.target as HTMLElement;
        if (el instanceof HTMLSelectElement) return submit();
        if (el instanceof HTMLInputElement) {
          if (el.type === "checkbox" || el.type === "radio") return submit();
          if (isTyped(el)) {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(submit, SEARCH_DELAY);
          }
        }
      }}
      onBlur={(event) => {
        const el = event.target;
        if (el instanceof HTMLInputElement && el.type === "date" && el.value !== el.defaultValue) submit();
      }}
    >
      {children}
    </Form>
  );
}

export function HiddenSubmit() {
  return (
    <button
      type="submit"
      className="sr-only focus:not-sr-only focus:text-sm focus:font-semibold focus:text-link focus:underline"
    >
      Apply filters
    </button>
  );
}

export function ClearFilters({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "whitespace-nowrap text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover",
        className,
      )}
    >
      Clear filters
    </Link>
  );
}

export function MoreFilters({
  count,
  applied,
  children,
}: {
  count: number;
  applied: number;
  children: React.ReactNode;
}) {
  return (
    <details className="group min-w-0 flex-1" open={applied > 0}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">More filters ({count})</span>
        <span className="hidden group-open:inline">Fewer filters</span>
        {applied > 0 ? <span className="text-muted no-underline">, {applied} applied</span> : null}
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </details>
  );
}
