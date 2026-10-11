import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

export const tableLink =
  "font-semibold text-link no-underline hover:text-link-hover hover:underline underline-offset-2";

export function ArrowLink({
  href,
  children,
  className,
  scroll,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      className={cn(
        "group/arrow inline-flex items-center gap-1.5 text-sm font-bold text-link no-underline underline-offset-2 hover:text-link-hover hover:underline",
        className,
      )}
    >
      {children}
      <ArrowRight
        className="h-4 w-4 shrink-0 transition-transform duration-150 ease-out group-hover/arrow:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}
