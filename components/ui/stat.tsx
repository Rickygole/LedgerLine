import Link from "next/link";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";

type Tone = "neutral" | "bad" | "warn" | "ok" | "info";

export function Stat({
  label,
  value,
  hint,
  sub,
  href,
  action,
  meter,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  action?: { href: string; label: string };
  meter?: { value: number; max: number; label?: string };
  tone?: Tone;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}) {
  const shown = typeof value === "number" ? formatCount(value) : value;
  const caption = sub ?? hint;
  const ratio = meter && meter.max > 0 ? Math.max(0, Math.min(1, meter.value / meter.max)) : 0;
  return (
    <div className={cn("flex h-full min-w-0 flex-col rounded border border-line bg-white p-5", className)}>
      <p className="flex items-center gap-2 text-sm font-semibold leading-5 text-ink-2">
        {tone === "bad" ? <span className="h-2 w-2 shrink-0 rounded-full bg-bad" aria-hidden="true" /> : null}
        {href && !action ? (
          <Link href={href} className="text-link underline underline-offset-2 hover:text-link-hover">
            {label}
          </Link>
        ) : (
          label
        )}
      </p>
      <p className="num mt-1.5 text-[36px] font-extrabold leading-[44px] tracking-[-0.02em] text-ink">{shown}</p>
      {meter ? (
        <div className="mt-2.5 h-2 overflow-hidden rounded-sm bg-harbor-100" role="img" aria-label={meter.label ?? `${Math.round(ratio * 100)} percent`}>
          <div className="h-full bg-ok" style={{ width: `${ratio * 100}%` }} />
        </div>
      ) : null}
      {caption ? <p className="mt-1.5 text-sm leading-5 text-muted">{caption}</p> : null}
      {action ? (
        <p className="mt-auto pt-3">
          <Link href={action.href} className="text-sm font-bold text-link underline underline-offset-2 hover:text-link-hover">
            {action.label}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
