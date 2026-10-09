import { cn } from "@/lib/cn";

export function Bone({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("skeleton block h-3", className)} />;
}

export function LoadingRegion({ label = "Loading page", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function HeaderSkeleton({ crumbs = true, action = false }: { crumbs?: boolean; action?: boolean }) {
  return (
    <div className="mb-6">
      {crumbs ? <Bone className="mb-3 w-40" /> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80 space-y-3">
          <Bone className="h-6 w-56" />
          <Bone className="w-full max-w-[34rem]" />
        </div>
        {action ? <Bone className="h-10 w-36 rounded-md" /> : null}
      </div>
    </div>
  );
}

export function TilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-l-[3px] border-line bg-white px-4 py-4 shadow-card sm:px-5">
          <Bone className="w-20" />
          <Bone className="mt-4 h-6 w-16" />
          <Bone className="mt-3 w-28" />
        </div>
      ))}
    </div>
  );
}

const widths = ["w-[70%]", "w-[55%]", "w-[80%]", "w-[60%]", "w-[75%]", "w-[50%]"];

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <Bone className="h-4 w-40" />
        <Bone className="hidden h-8 w-24 rounded-md sm:block" />
      </div>
      <div className="flex h-10 items-center gap-6 border-b border-line bg-surface px-4">
        {Array.from({ length: columns }, (_, c) => (
          <Bone key={c} className={cn("h-2.5 flex-1 bg-line-strong/60", c > 2 && "hidden md:block")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-12 items-center gap-6 border-b border-line/80 px-4 last:border-0">
          {Array.from({ length: columns }, (_, c) => (
            <span key={c} className={cn("flex-1", c > 2 && "hidden md:block")}>
              <Bone className={widths[(r + c) % widths.length]} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-line bg-white p-5 shadow-card", className)}>
      <Bone className="h-4 w-36" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }, (_, i) => (
          <Bone key={i} className={widths[i % widths.length]} />
        ))}
      </div>
    </div>
  );
}
