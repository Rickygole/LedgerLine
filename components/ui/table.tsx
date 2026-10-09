import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-x-auto overscroll-x-contain", className)}>
      <table className="w-full min-w-[36rem] border-collapse text-sm lg:min-w-0">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted shadow-[inset_0_-1px_0_var(--color-line)]">
      {children}
    </thead>
  );
}

export function TH({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", align === "right" && "text-right", className)}>
      {children}
    </th>
  );
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-line/80 transition-colors last:border-0 hover:bg-navy-50/60", className)}>{children}</tr>;
}

export function TD({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return <td className={cn("px-4 py-3 align-middle text-ink", align === "right" && "num whitespace-nowrap text-right", className)}>{children}</td>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-50 text-navy-600 ring-1 ring-navy-100" aria-hidden="true">
            <Inbox className="h-5 w-5" />
          </span>
          <div className="text-sm text-muted">{children}</div>
        </div>
      </td>
    </tr>
  );
}
