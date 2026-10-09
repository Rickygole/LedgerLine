"use client";

import { useEffect, useRef } from "react";
import { BookOpenCheck, ChevronDown, Info, LogOut } from "lucide-react";
import { signOut } from "@/app/actions/session";

export function UserMenu({ name, initials, email, roleText, orgText }: { name: string; initials: string; email: string; roleText: string; orgText: string | null }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPointer = (event: PointerEvent) => {
      if (el.open && !el.contains(event.target as Node)) el.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md py-1 pl-1 pr-2 text-left hover:bg-white/10 [&::-webkit-details-marker]:hidden" aria-label={`Account menu for ${name}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-600 text-xs font-bold tracking-wide text-white ring-2 ring-white/20" aria-hidden="true">
          {initials}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[14rem] truncate text-sm font-semibold leading-tight text-white">{name}</span>
          <span className="block max-w-[14rem] truncate text-xs leading-tight text-navy-200">{orgText ?? roleText}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-navy-200 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-lg border border-line bg-white text-ink shadow-raised">
        <div className="border-b border-line bg-surface px-4 py-3">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted">{email}</p>
          <p className="mt-2 inline-flex rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-semibold text-navy-800">{roleText}</p>
          {orgText ? <p className="mt-1.5 truncate text-xs text-muted">{orgText}</p> : null}
        </div>
        <ul className="py-1 text-sm">
          <li>
            <a href="/trust" className="flex items-center gap-2.5 px-4 py-2 hover:bg-navy-50">
              <BookOpenCheck className="h-4 w-4 text-muted" aria-hidden="true" />
              Requirements evidence
            </a>
          </li>
          <li>
            <a href="/about" className="flex items-center gap-2.5 px-4 py-2 hover:bg-navy-50">
              <Info className="h-4 w-4 text-muted" aria-hidden="true" />
              About this proof of concept
            </a>
          </li>
        </ul>
        <form action={signOut} className="border-t border-line py-1">
          <button type="submit" className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-medium text-bad hover:bg-bad-bg">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
