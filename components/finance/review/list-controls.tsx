import Link from "next/link";
import { ChevronDown, Download, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonClass } from "@/components/ui/button";
import { formatCount } from "@/lib/format";

export type Chip = { key: string; label: string; href: string };

export function ActiveChips({ chips }: { chips: Chip[] }) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="mb-4 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Link
            href={chip.href}
            className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-harbor-200 bg-harbor-50 pl-3 pr-2 text-sm font-semibold text-harbor-900 hover:border-harbor-600"
          >
            {chip.label}
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">, remove this filter</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type Tab = { key: string; label: string; count: number; href: string; active: boolean };

export function UnderlineTabs({ label, tabs }: { label: string; tabs: Tab[] }) {
  return (
    <nav aria-label={label} className="mb-4 border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => (
          <li key={tab.key} className="shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.active ? "true" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap border-b-[3px] px-3 py-3 text-[15px] font-semibold focus-visible:-outline-offset-4",
                tab.active
                  ? "border-action text-harbor-900"
                  : "border-transparent text-ink-2 hover:border-line-strong hover:text-link",
              )}
            >
              {tab.label}
              <span className="num font-medium text-muted">{formatCount(tab.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ExportMenu({ items }: { items: { label: string; href: string }[] }) {
  return (
    <details className="group relative">
      <summary
        className={cn(
          buttonClass("secondary", "md", "h-11 cursor-pointer list-none px-5 text-base"),
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Export
        <ChevronDown className="h-4 w-4 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul className="absolute right-0 z-20 mt-1 w-64 rounded border border-line bg-white py-1 shadow-[0_4px_16px_rgba(10,26,48,0.16)]">
        {items.map((item) => (
          <li key={item.label}>
            <a
              href={item.href}
              download
              className="block px-4 py-2.5 text-[15px] text-ink hover:bg-harbor-50 hover:text-link hover:underline"
            >
              {item.label}
            </a>
          </li>
        ))}
        <li className="border-t border-line-soft px-4 pb-1.5 pt-2.5 text-sm text-muted">
          Includes every report that matches these filters and has been submitted. Reports not yet submitted have no
          answers to export.
        </li>
      </ul>
    </details>
  );
}
