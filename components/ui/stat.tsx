import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";

export function Stat({ label, value, hint, href, tone = "neutral", icon: Icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "neutral" | "bad" | "warn" | "ok" | "info"; icon?: ComponentType<{ className?: string }> }) {
  const accent = { neutral: "text-ink", bad: "text-bad", warn: "text-warn", ok: "text-ok", info: "text-navy-700" }[tone];
  const body = (
    <div className={cn("h-full rounded-xl border border-line bg-white px-5 py-4 shadow-card", href && "transition-[border-color,box-shadow] hover:border-navy-600/40 hover:shadow-raised")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
        {Icon ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface ring-1 ring-line" aria-hidden="true">
            <Icon className={cn("h-4 w-4", accent)} />
          </span>
        ) : null}
      </div>
      <p className={cn("num mt-2 text-[26px] font-bold leading-8 tracking-tight", accent)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
