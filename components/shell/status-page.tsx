import { cn } from "@/lib/cn";

export function StatusPanel({
  title,
  children,
  actions,
  tone = "neutral",
  footnote,
}: {
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
  tone?: "neutral" | "bad";
  footnote?: React.ReactNode;
}) {
  return (
    <div className="py-4 sm:py-10">
      <section aria-labelledby="status-title" className={cn("max-w-2xl rounded border border-l-4 border-line bg-white px-5 py-7 sm:px-8", tone === "bad" ? "border-l-bad" : "border-l-navy-700")}>
        <h1 id="status-title" className="text-[1.75rem] font-bold leading-9 text-ink">
          {title}
        </h1>
        <div className="mt-3 max-w-[60ch] space-y-3 text-base leading-7 text-ink">{children}</div>
        <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">{actions}</div>
        {footnote ? <p className="mt-6 border-t border-line pt-4 text-sm text-muted">{footnote}</p> : null}
      </section>
    </div>
  );
}
