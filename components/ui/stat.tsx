import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";

export function Stat({ label, value, hint, href, tone = "neutral", icon: Icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "neutral" | "bad" | "warn" | "ok" | "info"; icon?: ComponentType<{ className?: string }> }) {
  const accent = { neutral: "text-muted", bad: "text-bad", warn: "text-warn", ok: "text-ok", info: "text-navy-700" }[tone];
  const edge = { neutral: "border-l-line", bad: "border-l-bad", warn: "border-l-warn", ok: "border-l-ok", info: "border-l-navy-600" }[tone];
  const body = (
    <div className={cn("group/stat relative flex h-full flex-col rounded-xl border border-l-[3px] border-line bg-white px-4 py-4 shadow-card sm:px-5", edge, href && "transition-[border-color,box-shadow] hover:border-navy-600/40 hover:shadow-raised")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4 shrink-0", accent)} aria-hidden="true" /> : null}
      </div>
      <p className="num mt-2 text-[22px] font-bold leading-8 tracking-tight text-ink sm:text-[28px]">{value}</p>
      <p className="mt-1 min-h-4 text-xs text-muted">{hint}</p>
      {href ? <ChevronRight className="absolute right-4 bottom-4 h-4 w-4 text-navy-700 opacity-0 transition-opacity group-hover/stat:opacity-100" aria-hidden="true" /> : null}
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
