import Link from "next/link";
import { cn } from "@/lib/cn";

export type Pill = { key: string; label: string; count: number; href: string; active: boolean };

export function FilterPills({ label, pills }: { label: string; pills: Pill[] }) {
  return (
    <nav aria-label={label} className="relative mb-3">
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [mask-image:linear-gradient(to_right,black_90%,transparent)] sm:flex-wrap sm:overflow-visible sm:[mask-image:none]">
        {pills.map((pill) => (
          <li key={pill.key} className="shrink-0">
            <Link
              href={pill.href}
              aria-current={pill.active ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-sm border px-3 text-sm font-medium",
                pill.active ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-ink hover:border-line-strong hover:bg-navy-50"
              )}
            >
              {pill.label}
              <span className={cn("num rounded-sm px-1.5 text-xs font-semibold", pill.active ? "bg-white/15 text-white" : pill.count === 0 ? "text-muted" : "bg-surface text-muted")}>{pill.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
