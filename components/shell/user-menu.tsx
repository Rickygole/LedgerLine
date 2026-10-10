"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, CircleUser, LogOut } from "lucide-react";
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
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded px-2 py-1 text-left hover:bg-harbor-800 [&::-webkit-details-marker]:hidden" aria-label={`Account menu for ${name}`} title={initials}>
        <CircleUser className="h-6 w-6 shrink-0 text-white sm:hidden" aria-hidden="true" />
        <span className="hidden min-w-0 text-right sm:block">
          <span className="block max-w-[16rem] truncate text-sm font-semibold leading-5 text-white">{name}</span>
          <span className="block max-w-[16rem] truncate text-[12.5px] leading-4 text-harbor-200">{orgText ?? roleText}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-harbor-200 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded border border-line-strong bg-white text-ink shadow-[0_4px_16px_rgba(10,26,48,0.16)]">
        <div className="border-b border-line bg-surface px-4 py-3">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted">{email}</p>
          <p className="mt-2 inline-flex rounded-sm bg-harbor-100 px-2 py-0.5 text-[13px] font-semibold text-harbor-800">{roleText}</p>
          {orgText ? <p className="mt-1.5 truncate text-xs text-muted">{orgText}</p> : null}
        </div>
        <form action={signOut} className="py-1">
          <button type="submit" className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-link underline underline-offset-2 hover:bg-surface hover:text-link-hover">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
