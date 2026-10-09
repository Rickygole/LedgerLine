export function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="text-lg font-bold leading-none text-white">LedgerLine</span>
      {subtitle ? <span className="hidden truncate border-l border-navy-300 pl-3 text-sm leading-none text-navy-100 sm:inline">{subtitle}</span> : null}
    </span>
  );
}
