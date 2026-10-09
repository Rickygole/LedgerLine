import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";

export function Stat({ label, value, hint, href, tone = "neutral", icon: Icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "neutral" | "bad" | "warn" | "ok" | "info"; icon?: ComponentType<{ className?: string }> }) {
  const accent = { neutral: "text-ink", bad: "text-bad", warn: "text-warn", ok: "text-ok", info: "text-navy-700" }[tone];
  const body = (
    <div className={cn("h-full rounded-lg border border-line bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", href && "transition-colors hover:border-navy-600/40 hover:bg-navy-50/40")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4", accent)} aria-hidden="true" /> : null}
      </div>
      <p className={cn("num mt-2 text-2xl font-bold", accent)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-lg">
      {body}
    </Link>
  ) : (
    body
  );
}
