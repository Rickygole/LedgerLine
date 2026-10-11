import { Breadcrumbs, type Crumb } from "./page-header";

export function ProfileHeader({
  title,
  subtitle,
  crumbs,
  meta,
  actions,
  tabs,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  crumbs?: Crumb[];
  meta?: React.ReactNode[];
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const items = (meta ?? []).filter(Boolean);
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 ? <Breadcrumbs crumbs={crumbs} /> : null}
      <div className="min-w-0 overflow-hidden rounded border border-line bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0 flex-1 basis-80">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-ink">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
              {items.length > 0 ? (
                <div className="mt-2 overflow-hidden">
                  <ul className="-ml-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 py-0.5 text-sm text-muted">
                    {items.map((item, index) => (
                      <li key={index} className="flex items-center gap-2.5">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
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
