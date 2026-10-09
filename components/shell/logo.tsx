export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1b365d" />
      <path d="M9 8v16h14" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 19.5h4M13.5 15h7M13.5 10.5h5" stroke="#9fb7da" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-bold tracking-tight text-white">LedgerLine</span>
        {subtitle ? <span className="mt-0.5 text-[11px] font-medium text-navy-100/80">{subtitle}</span> : null}
      </span>
    </span>
  );
}
