import { cn } from "@/lib/cn";

export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="4" fill="#2b64a8" />
      <rect x="6" y="8" width="12" height="2" fill="#c7d7ec" />
      <rect x="6" y="14" width="12" height="2" fill="#c7d7ec" />
      <path d="M19 11.5l3.5 3.5L28 7.5" fill="none" stroke="#ffffff" strokeWidth="3" />
      <rect x="6" y="20" width="20" height="2" fill="#ffffff" />
      <rect x="6" y="24" width="20" height="2" fill="#ffffff" />
    </svg>
  );
}

const TAGLINE = "Initiative reporting for NYC Council Finance";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean; subtitle?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      <Mark className="h-8 w-8 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[21px] font-extrabold leading-6 tracking-[-0.01em] text-white">LedgerLine</span>
        {compact ? null : (
          <span className="hidden truncate text-[12.5px] font-medium leading-4 text-harbor-200 min-[400px]:block">
            {TAGLINE}
          </span>
        )}
      </span>
    </span>
  );
}
