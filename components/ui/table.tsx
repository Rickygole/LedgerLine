import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { ScrollArea } from "./scroll-area";

const pin =
  "max-lg:[&_tbody_td:first-child:not([colspan])]:sticky max-lg:[&_tbody_td:first-child:not([colspan])]:left-0 max-lg:[&_tbody_td:first-child:not([colspan])]:z-[1] max-lg:[&_tbody_td:first-child:not([colspan])]:min-w-[11rem] max-lg:[&_tbody_td:first-child:not([colspan])]:bg-inherit max-lg:[&_tbody_td:first-child:not([colspan])]:shadow-[inset_-1px_0_0_var(--color-line)] max-lg:[&_thead_th:first-child]:sticky max-lg:[&_thead_th:first-child]:left-0 max-lg:[&_thead_th:first-child]:z-[2] max-lg:[&_thead_th:first-child]:bg-surface max-lg:[&_thead_th:first-child]:shadow-[inset_-1px_0_0_var(--color-line)]";

const compact = "[&_td]:px-3 [&_th]:px-3 [&_td:not([colspan])]:py-2";

export function Table({ children, className, stack = false, density = "default" }: { children: React.ReactNode; className?: string; stack?: boolean; density?: "default" | "compact" }) {
  return (
    <ScrollArea className={cn(stack ? "table-stack" : pin, density === "compact" && compact, className)}>
      <table className="w-full min-w-[48rem] border-collapse text-sm lg:min-w-0">{children}</table>
    </ScrollArea>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-surface text-left text-[13px] font-bold text-ink shadow-[inset_0_-2px_0_var(--color-line-strong)]">
      {children}
    </thead>
  );
}

export function TH({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-4 py-2.5 font-bold", align === "right" && "text-right", className)}>
      {children}
    </th>
  );
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-line bg-white last:border-0 hover:bg-navy-50/60", className)}>{children}</tr>;
}

export function TD({ children, className, align = "left", label, primary, action, stackHidden }: { children?: React.ReactNode; className?: string; align?: "left" | "right"; label?: string; primary?: boolean; action?: boolean; stackHidden?: boolean }) {
  return (
    <td data-label={label} data-primary={primary ? "" : undefined} data-action={action ? "" : undefined} data-stack-hidden={stackHidden ? "" : undefined} className={cn("px-4 py-3 align-middle text-ink", align === "right" && "num whitespace-nowrap text-right", className)}>
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <Inbox className="h-6 w-6 text-muted" aria-hidden="true" />
          <div className="text-sm text-muted">{children}</div>
        </div>
      </td>
    </tr>
  );
}
