import { Breadcrumbs, type Crumb } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";

export const H1 = "text-[26px] font-extrabold leading-8 tracking-[-0.015em] text-ink sm:text-[32px] sm:leading-10";
export const EYEBROW = "text-sm font-semibold leading-5 text-muted";
export const LEDE = "max-w-[70ch] text-lg leading-7 text-[#3d4757]";

export function PageTitle({
  title,
  eyebrow,
  lede,
  crumbs,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  lede?: React.ReactNode;
  crumbs?: Crumb[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-7", className)}>
      {crumbs && crumbs.length > 0 ? <Breadcrumbs crumbs={crumbs} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-[28rem]">
          {eyebrow ? <p className={EYEBROW}>{eyebrow}</p> : null}
          <h1 className={cn(H1, eyebrow ? "mt-1" : null)}>{title}</h1>
          {lede ? <p className={cn(LEDE, "mt-2")}>{lede}</p> : null}
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] leading-[22px] text-[#3d4757]">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
