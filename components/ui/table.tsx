import { cn } from "@/lib/cn";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-line bg-surface/70 text-left text-xs font-semibold uppercase tracking-wide text-muted">{children}</thead>;
}

export function TH({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return (
    <th scope="col" className={cn("px-4 py-2.5 font-semibold", align === "right" && "text-right", className)}>
      {children}
    </th>
  );
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-line last:border-0 hover:bg-navy-50/40", className)}>{children}</tr>;
}

export function TD({ children, className, align = "left" }: { children?: React.ReactNode; className?: string; align?: "left" | "right" }) {
  return <td className={cn("px-4 py-3 align-middle", align === "right" && "num text-right", className)}>{children}</td>;
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted">
        {children}
      </td>
    </tr>
  );
}
