import { Children } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { FilterDisclosure } from "@/components/ui/filter-disclosure";

export function FilterBar({ action, clearHref, applied = 0, keep = 1, children }: { action: string; clearHref: string; applied?: number; keep?: number; children: React.ReactNode }) {
  const items = Children.toArray(children);
  const shown = items.slice(0, keep);
  const folded = items.slice(keep);
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-4 max-lg:[&>div]:w-full max-lg:[&>div]:min-w-0 max-lg:[&>div>div]:w-full max-lg:[&>div>div]:min-w-0">
      {shown}
      {folded.length > 0 ? (
        <FilterDisclosure layout="flex" applied={applied}>
          {folded}
        </FilterDisclosure>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="md">
          Apply filters
        </Button>
        <Link href={clearHref} className={buttonClass("ghost", "md")}>
          Clear
        </Link>
      </div>
    </form>
  );
}

export function FilterField({ label, htmlFor, className, children }: { label: string; htmlFor: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
