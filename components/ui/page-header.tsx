import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; href?: string };

export function PageHeader({ title, description, crumbs, actions, meta }: { title: React.ReactNode; description?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <div className="mb-6 sm:mb-7">
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-line-strong" aria-hidden="true" /> : null}
                {crumb.href ? (
                  <Link href={crumb.href} className="rounded-sm hover:text-navy-800 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="font-medium text-ink">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 basis-80">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px] sm:leading-9">{title}</h1>
          {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted">{description}</p> : null}
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
