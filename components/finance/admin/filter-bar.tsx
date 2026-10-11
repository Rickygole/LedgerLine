import { Children } from "react";
import { AutoFilterForm, ClearFilters, HiddenSubmit, MoreFilters } from "@/components/ui/auto-filter-form";

export function FilterBar({
  action,
  clearHref,
  active = false,
  keep,
  moreApplied = 0,
  label,
  children,
}: {
  action: string;
  clearHref: string;
  active?: boolean;
  keep?: number;
  moreApplied?: number;
  label?: string;
  children: React.ReactNode;
}) {
  const items = Children.toArray(children);
  const shown = keep === undefined ? items : items.slice(0, keep);
  const folded = keep === undefined ? [] : items.slice(keep);
  return (
    <AutoFilterForm action={action} label={label} className="border-b border-line px-4 py-4">
      <div className="flex flex-wrap items-end gap-3 max-sm:[&>div]:w-full max-sm:[&>div]:min-w-0">
        {shown}
        {folded.length === 0 && active ? (
          <div className="flex h-10 items-center max-sm:h-auto">
            <ClearFilters href={clearHref} />
          </div>
        ) : null}
      </div>
      {folded.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <MoreFilters count={folded.length} applied={moreApplied}>
            {folded}
          </MoreFilters>
          {active ? <ClearFilters href={clearHref} /> : null}
        </div>
      ) : null}
      <HiddenSubmit />
    </AutoFilterForm>
  );
}

export function FilterField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}
