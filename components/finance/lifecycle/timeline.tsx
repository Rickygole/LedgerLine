import { Flag } from "lucide-react";
import { cn } from "@/lib/cn";

export type Milestone = { when: string; title: string; detail: string; goal?: boolean };

export function Timeline({ items }: { items: Milestone[] }) {
  return (
    <ol className="relative space-y-0">
      {items.map((item, index) => (
        <li key={item.title} className="relative flex gap-4 pb-6 last:pb-0">
          {index < items.length - 1 ? <span className="absolute left-[0.8125rem] top-7 h-[calc(100%-1.25rem)] w-px bg-line" aria-hidden="true" /> : null}
          <span
            className={cn("relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold", item.goal ? "border-navy-800 bg-navy-800 text-white" : "border-line bg-white text-navy-800")}
            aria-hidden="true"
          >
            {item.goal ? <Flag className="h-3.5 w-3.5" /> : index + 1}
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-muted">{item.when}</p>
            <p className={cn("text-sm font-semibold", item.goal ? "text-navy-900" : "text-ink")}>{item.title}</p>
            <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
