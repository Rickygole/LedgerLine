import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { buildHref } from "@/lib/finance/admin/params";
import { cn } from "@/lib/cn";

export function SortHeader({ base, params, field, label, sort, dir, align = "left" }: { base: string; params: Record<string, string | undefined>; field: string; label: string; sort: string; dir: "asc" | "desc"; align?: "left" | "right" }) {
  const active = sort === field;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const Icon = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined} className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", align === "right" && "text-right")}>
      <Link href={buildHref(base, { ...params, sort: field, dir: nextDir, page: undefined })} className={cn("inline-flex items-center gap-1 rounded-sm hover:text-navy-800", active && "text-navy-800")}>
        {label}
        {active ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      </Link>
    </th>
  );
}
