import Link from "next/link";
import { cn } from "@/lib/cn";

export type FilterOption = { value: string; label: string; count?: number };

export function Segmented({ label, param, options, current, base }: { label: string; param: string; options: FilterOption[]; current: string; base: Record<string, string> }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-line bg-white p-0.5 shadow-sm">
      {options.map((option) => {
        const active = option.value === current;
        const query = new URLSearchParams({ ...base, [param]: option.value });
        if (option.value === "all") query.delete(param);
        const qs = query.toString();
        return (
          <Link
            key={option.value}
            href={qs ? `?${qs}` : "?"}
            aria-current={active ? "true" : undefined}
            className={cn("rounded px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-navy-800 text-white" : "text-muted hover:bg-navy-50 hover:text-ink")}
          >
            {option.label}
            {option.count !== undefined ? <span className={cn("num ml-1.5 text-xs", active ? "text-white/80" : "text-muted")}>{option.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
