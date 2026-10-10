import Link from "next/link";
import { cn } from "@/lib/cn";

export function TabNav({
  base,
  tabs,
  current,
  label,
  attached = false,
}: {
  base: string;
  tabs: { key: string; label: string; count?: number }[];
  current: string;
  label: string;
  attached?: boolean;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex gap-1 overflow-x-auto [scrollbar-width:none]",
        attached ? "-mb-px" : "mb-4 border-b border-line",
      )}
    >
      {tabs.map((tab) => {
        const active = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={`${base}?tab=${tab.key}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold focus-visible:-outline-offset-2",
              active
                ? "border-navy-800 text-navy-900"
                : "border-transparent text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  "num ml-2 rounded-sm px-1.5 py-px text-xs",
                  active ? "bg-navy-800 text-white" : "bg-surface text-muted ring-1 ring-inset ring-line",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
