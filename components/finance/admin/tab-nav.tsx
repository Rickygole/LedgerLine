import Link from "next/link";
import { cn } from "@/lib/cn";

export function TabNav({ base, tabs, current, label }: { base: string; tabs: { key: string; label: string; count?: number }[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={`${base}?tab=${tab.key}`}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors", active ? "border-navy-800 text-navy-900" : "border-transparent text-muted hover:text-ink")}
          >
            {tab.label}
            {tab.count !== undefined ? <span className="num ml-2 rounded-full bg-surface px-2 py-0.5 text-xs text-muted ring-1 ring-inset ring-line">{tab.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
