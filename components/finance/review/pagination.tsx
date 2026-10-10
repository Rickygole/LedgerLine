import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function Pagination({
  page,
  pages,
  from,
  to,
  total,
  hrefFor,
  noun = "reports",
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  hrefFor: (page: number) => string;
  noun?: string;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm"
    >
      <p className="num text-muted" aria-live="polite">
        {total === 0 ? `No ${noun}` : `Showing ${from} to ${to} of ${total} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={buttonClass("secondary", "sm")} rel="prev">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </Link>
        ) : null}
        <span className="num text-muted">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={buttonClass("secondary", "sm")} rel="next">
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
