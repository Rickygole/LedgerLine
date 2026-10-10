import Link from "next/link";
import { cn } from "@/lib/cn";

export type FilterOption = { value: string; label: string; count?: number };

export function Segmented({ label, param, options, current, base }: { label: string; param: string; options: FilterOption[]; current: string; base: Record<string, string> }) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-line bg-surface p-0.5">
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
            className={cn("whitespace-nowrap rounded px-3 py-1.5 text-sm font-medium", active ? "bg-white font-semibold text-harbor-900 shadow-sm ring-1 ring-line" : "text-muted hover:bg-white/70 hover:text-ink")}
          >
            {option.label}
            {option.count !== undefined ? <span className={cn("num ml-1.5 text-xs", active ? "text-harbor-700" : "text-muted")}>{option.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
