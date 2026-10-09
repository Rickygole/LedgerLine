import type { ComponentType } from "react";
import { cn } from "@/lib/cn";

export function StatusPanel({
  icon: Icon,
  eyebrow,
  title,
  children,
  actions,
  tone = "neutral",
  footnote,
}: {
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  tone?: "neutral" | "bad";
  footnote?: React.ReactNode;
}) {
  return (
    <div className="flex justify-center py-8 sm:py-16">
      <section aria-labelledby="status-title" className="w-full max-w-xl rounded-xl border border-line bg-white px-6 py-10 text-center shadow-card sm:px-10">
        <span className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-full ring-1", tone === "bad" ? "bg-bad-bg text-bad ring-bad/15" : "bg-navy-50 text-navy-700 ring-navy-100")} aria-hidden="true">
          <Icon className="h-6 w-6" />
        </span>
        <p className="eyebrow mt-5">{eyebrow}</p>
        <h1 id="status-title" className="mt-1.5 text-2xl font-bold tracking-tight text-ink">
          {title}
        </h1>
        <div className="mx-auto mt-3 max-w-[52ch] text-[15px] leading-6 text-muted">{children}</div>
        <div className="mt-7 flex flex-col-reverse items-stretch justify-center gap-2 sm:flex-row sm:items-center">{actions}</div>
        {footnote ? <p className="mt-6 border-t border-line pt-4 text-xs text-muted">{footnote}</p> : null}
      </section>
    </div>
  );
}
