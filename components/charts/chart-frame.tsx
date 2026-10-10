import { BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { cn } from "@/lib/cn";

export const CHART_COLORS: Record<Bucket, string> = {
  accepted: "#1a7f37",
  in_review: "#1f4e85",
  submitted: "#6cb4ee",
  returned: "#c98a0b",
  missing: "#b42318",
  outstanding: "#d5dae1",
};

export const LABEL_ON_DARK: Record<Bucket, boolean> = {
  accepted: true,
  in_review: true,
  submitted: false,
  returned: false,
  missing: true,
  outstanding: false,
};

export const STACK: Bucket[] = ["accepted", "in_review", "submitted", "returned", "missing", "outstanding"];

export const AXIS = { fontSize: 12, fill: "#566173" };
export const GRID = "#dfe3ea";

export function ChartLegend({ totals, className }: { totals: Record<Bucket, number>; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted", className)} aria-hidden="true">
      {STACK.filter((bucket) => totals[bucket] > 0).map((bucket) => (
        <li key={bucket} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[bucket] }} />
          <span className="text-ink">{BUCKET_LABEL[bucket]}</span>
          <span className="num">{totals[bucket]}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChartFrame({
  title,
  description,
  children,
  table,
  source,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  table: React.ReactNode;
  source: string;
  className?: string;
}) {
  return (
    <figure className={cn("flex min-w-0 flex-col rounded border border-line bg-white", className)}>
      <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
        <h2 className="text-xl font-bold leading-7 text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">{description}</p> : null}
      </div>
      <div className="px-5 pt-4 sm:px-6">{children}</div>
      <details className="group mx-5 mt-3 border-t border-line-soft pt-3 text-sm sm:mx-6">
        <summary className="inline-flex cursor-pointer list-none items-center rounded-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">View as table</span>
          <span className="hidden group-open:inline">Hide table</span>
        </summary>
        <div className="mt-3 overflow-x-auto rounded-md border border-line">{table}</div>
      </details>
      <figcaption className="px-5 pb-4 pt-3 text-[13px] text-muted sm:px-6">{source}</figcaption>
    </figure>
  );
}
