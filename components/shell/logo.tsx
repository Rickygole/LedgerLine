export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#24497c" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" fill="none" stroke="#ffffff" strokeOpacity="0.18" />
      <path d="M9 8v16h14" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 19.5h4M13.5 15h7M13.5 10.5h5" stroke="#9fb7da" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ subtitle, tone = "dark" }: { subtitle?: string; tone?: "dark" | "light" }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="h-8 w-8 shrink-0" />
      <span className="flex min-w-0 flex-col leading-none">
        <span className={tone === "dark" ? "text-[15px] font-bold tracking-tight text-white" : "text-[15px] font-bold tracking-tight text-navy-900"}>LedgerLine</span>
        {subtitle ? <span className={tone === "dark" ? "mt-0.5 truncate text-[11px] font-medium leading-tight text-navy-200" : "mt-0.5 truncate text-[11px] font-medium leading-tight text-muted"}>{subtitle}</span> : null}
      </span>
    </span>
  );
}
