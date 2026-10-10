import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildHref } from "@/lib/finance/admin/params";
import { buttonClass } from "@/components/ui/button";
import { formatCount } from "@/lib/format";

export function Pagination({
  base,
  params,
  page,
  pageSize,
  total,
}: {
  base: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
      <p>
        <span className="num">{from}</span> to <span className="num">{to}</span> of{" "}
        <span className="num">{formatCount(total)}</span>
      </p>
      <nav aria-label="Pagination" className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={buildHref(base, { ...params, page: page - 1 })} className={buttonClass("secondary", "sm")}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </Link>
        ) : null}
        <span className="num">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={buildHref(base, { ...params, page: page + 1 })} className={buttonClass("secondary", "sm")}>
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
