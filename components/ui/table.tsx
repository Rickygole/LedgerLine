import { Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { ScrollArea } from "./scroll-area";

const pin =
  "max-lg:[&_tbody_td:first-child:not([colspan])]:sticky max-lg:[&_tbody_td:first-child:not([colspan])]:left-0 max-lg:[&_tbody_td:first-child:not([colspan])]:z-[1] max-lg:[&_tbody_td:first-child:not([colspan])]:min-w-[11rem] max-lg:[&_tbody_td:first-child:not([colspan])]:bg-inherit max-lg:[&_tbody_td:first-child:not([colspan])]:shadow-[inset_-1px_0_0_var(--color-line)] max-lg:[&_thead_th:first-child]:sticky max-lg:[&_thead_th:first-child]:left-0 max-lg:[&_thead_th:first-child]:z-[2] max-lg:[&_thead_th:first-child]:bg-harbor-50 max-lg:[&_thead_th:first-child]:shadow-[inset_-1px_0_0_var(--color-line)]";

const compact =
  "[&_td]:px-3 [&_th]:px-3 [&_td:not([colspan])]:py-2 [&_table]:text-sm [&_table]:leading-5 md:[&_tr]:h-auto";

export function Table({
  children,
  className,
  stack = false,
  density = "default",
}: {
  children: React.ReactNode;
  className?: string;
  stack?: boolean;
  density?: "default" | "compact";
}) {
  return (
    <ScrollArea className={cn(stack ? "table-stack" : pin, density === "compact" && compact, className)}>
      <table className="w-full min-w-[48rem] border-collapse text-[15px] leading-[22px] lg:min-w-0">{children}</table>
    </ScrollArea>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-harbor-50 text-left text-sm font-semibold text-ink-2 shadow-[inset_0_-1px_0_var(--color-line)]">
      {children}
    </thead>
  );
}

export function TH({
  children,
  className,
  align = "left",
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={cn("h-11 whitespace-nowrap px-4 py-2 font-semibold", align === "right" && "text-right", className)}
    >
      {children}
    </th>
  );
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={cn("border-b border-line-soft bg-white md:h-[52px] last:border-0 hover:bg-harbor-50", className)}>
      {children}
    </tr>
  );
}

export function TD({
  children,
  className,
  align = "left",
  label,
  primary,
  action,
  stackHidden,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right";
  label?: string;
  primary?: boolean;
  action?: boolean;
  stackHidden?: boolean;
}) {
  return (
    <td
      data-label={label}
      data-primary={primary ? "" : undefined}
      data-action={action ? "" : undefined}
      data-stack-hidden={stackHidden ? "" : undefined}
      className={cn(
        "px-4 py-3 align-middle text-ink",
        align === "right" && "num whitespace-nowrap text-right",
        className,
      )}
    >
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
