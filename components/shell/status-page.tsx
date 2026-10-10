import { cn } from "@/lib/cn";

export function StatusPanel({
  title,
  children,
  actions,
  tone = "neutral",
  footnote,
  eyebrow,
}: {
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  tone?: "neutral" | "bad";
  footnote?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="py-4 sm:py-10">
      <section aria-labelledby="status-title" className={cn("max-w-[720px] rounded border border-l-4 border-line bg-white px-5 py-8 sm:px-10 sm:py-10", tone === "bad" ? "border-l-bad" : "border-l-harbor-700")}>
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1 id="status-title" className="text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10">
          {title}
        </h1>
        <div className="mt-4 max-w-[60ch] space-y-3 text-lg leading-7 text-ink-2">{children}</div>
        <div className="mt-7 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">{actions}</div>
        {footnote ? <p className="mt-7 border-t border-line-soft pt-4 text-sm leading-[22px] text-muted">{footnote}</p> : null}
      </section>
    </div>
  );
}
