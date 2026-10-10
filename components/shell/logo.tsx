import { cn } from "@/lib/cn";

export function Mark({ className = "h-8 w-8", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const tile = tone === "light" ? "#ffffff" : "#0f2645";
  const bar = tone === "light" ? "#0f2645" : "#ffffff";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="4" fill={tile} />
      <rect x="8" y="7" width="4" height="18" fill={bar} />
      <rect x="8" y="21" width="17" height="4" fill={bar} />
      <rect x="15" y="9" width="10" height="2" fill="#6cb4ee" />
      <rect x="15" y="13" width="10" height="2" fill="#6cb4ee" />
      <rect x="15" y="17" width="10" height="2" fill="#6cb4ee" />
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
