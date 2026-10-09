import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";

export function Stat({ label, value, hint, href, tone = "neutral", icon: Icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "neutral" | "bad" | "warn" | "ok" | "info"; icon?: ComponentType<{ className?: string }> }) {
  const accent = { neutral: "text-muted", bad: "text-bad", warn: "text-warn", ok: "text-ok", info: "text-navy-700" }[tone];
  const edge = { neutral: "border-l-line-strong", bad: "border-l-bad", warn: "border-l-warn", ok: "border-l-ok", info: "border-l-navy-600" }[tone];
  const shown = typeof value === "number" ? value.toLocaleString("en-US") : value;
  return (
    <div className={cn("relative flex h-full flex-col rounded border border-l-4 border-line bg-white px-4 py-4 sm:px-5", edge, href && "hover:border-line-strong hover:bg-navy-50/40")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {href ? (
            <Link href={href} className="text-link underline underline-offset-2 after:absolute after:inset-0 hover:text-link-hover">
              {label}
            </Link>
          ) : (
            label
          )}
        </p>
        {Icon ? <Icon className={cn("h-4 w-4 shrink-0", accent)} aria-hidden="true" /> : null}
      </div>
      <p className="num mt-2 text-2xl font-bold leading-8 text-ink sm:text-[1.75rem]">{shown}</p>
      <p className="mt-1 min-h-4 text-xs text-muted">{hint}</p>
    </div>
  );
}
