import { cn } from "@/lib/cn";

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-1.5 w-20 overflow-hidden rounded-full bg-navy-100"
      >
        <div
          className={cn("h-full rounded-full", pct === 100 ? "bg-ok" : "bg-navy-600")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn("num whitespace-nowrap text-xs", value === 0 && max > 0 ? "font-medium text-warn" : "text-muted")}
      >
        {value} of {max} accepted
      </span>
    </div>
  );
}
