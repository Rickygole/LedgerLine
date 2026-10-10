import Link from "next/link";

export function StatTile({ label, value, of, sub, action, bad = false, meter }: { label: string; value: number | string; of?: number; sub: React.ReactNode; action?: { href: string; label: string }; bad?: boolean; meter?: number }) {
  return (
    <div className="flex min-w-0 flex-col rounded border border-line bg-white p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#3d4757]">
        {bad ? <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-bad" /> : null}
        {label}
      </p>
      <p className="mt-1 text-ink">
        <span className="num text-[36px] font-extrabold leading-[44px] tracking-[-0.02em]">{typeof value === "number" ? value.toLocaleString("en-US") : value}</span>
        {of !== undefined ? <span className="num ml-1.5 text-lg font-semibold text-[#3d4757]">of {of.toLocaleString("en-US")}</span> : null}
      </p>
      {meter !== undefined ? (
        <span aria-hidden="true" className="mt-2 block h-2 overflow-hidden rounded-sm bg-navy-100">
          <span className="block h-full bg-ok" style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </span>
      ) : null}
      <p className="mt-1 text-sm text-muted">{sub}</p>
      {action ? (
        <Link href={action.href} className="mt-3 text-sm font-bold text-link underline underline-offset-2 hover:text-link-hover">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
