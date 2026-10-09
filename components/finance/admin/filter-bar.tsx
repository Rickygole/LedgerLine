import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";

export function FilterBar({ action, clearHref, children }: { action: string; clearHref: string; children: React.ReactNode }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-4">
      {children}
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
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
