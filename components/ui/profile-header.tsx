import { Breadcrumbs, type Crumb } from "./page-header";

export function monogram(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w && !["of", "the", "and", "for", "inc", "llc"].includes(w.toLowerCase()));
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ProfileHeader({ title, subtitle, crumbs, meta, actions, tabs, children }: { title: string; subtitle?: React.ReactNode; crumbs?: Crumb[]; meta?: React.ReactNode[]; actions?: React.ReactNode; tabs?: React.ReactNode; children?: React.ReactNode }) {
  const items = (meta ?? []).filter(Boolean);
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 ? <Breadcrumbs crumbs={crumbs} /> : null}
      <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-white shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="flex min-w-0 flex-1 basis-80 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-lg font-bold text-navy-800" aria-hidden="true">
              {monogram(title)}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
              {items.length > 0 ? (
                <ul className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted">
                  {items.map((item, index) => (
                    <li key={index} className="flex items-center gap-2.5">
                      {index > 0 ? <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" /> : null}
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          {actions ? <div className="no-print flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {children ? <div className="border-t border-line">{children}</div> : null}
        {tabs ? <div className="no-print border-t border-line px-2 sm:px-3">{tabs}</div> : null}
      </div>
    </div>
  );
}
