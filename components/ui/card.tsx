import { cn } from "@/lib/cn";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-w-0 rounded border border-line bg-white", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-line-soft px-6 pb-4 pt-5", className)}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold leading-7 text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm leading-5 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

export function DescriptionList({ items, columns = 2, compact = false }: { items: { label: string; value: React.ReactNode }[]; columns?: 1 | 2 | 3; compact?: boolean }) {
  const cols = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];
  return (
    <dl className={cn("grid gap-x-6", compact ? "grid-cols-2 gap-y-3 sm:gap-y-4" : "grid-cols-1 gap-y-4", cols)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-sm font-semibold text-ink-2">{item.label}</dt>
          <dd className="mt-1 text-[15px] leading-[22px] text-ink break-words">{item.value ?? <span className="text-muted">Not provided</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
