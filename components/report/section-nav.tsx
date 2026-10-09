"use client";

import { AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/cn";

export type NavSection = { key: string; title: string; state: "complete" | "attention" | "todo" };

export function SectionNav({ sections, active, onJump }: { sections: NavSection[]; active: string; onJump: (key: string) => void }) {
  const done = sections.filter((section) => section.state === "complete").length;
  return (
    <nav aria-label="Report sections" className="no-print">
      <p className="num mb-2 hidden text-[13px] font-semibold text-muted lg:block">
        {done} of {sections.length} sections complete
      </p>
      <div className="mb-3 hidden h-1.5 overflow-hidden rounded-full bg-line lg:block" aria-hidden="true">
        <div className="h-full bg-ok" style={{ width: `${Math.round((done / sections.length) * 100)}%` }} />
      </div>
      <ol className="relative -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 [mask-image:linear-gradient(to_right,black_85%,transparent)] lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0 lg:[mask-image:none]">
        {sections.map((section) => {
          const Icon = section.state === "complete" ? CheckCircle2 : section.state === "attention" ? AlertCircle : Circle;
          return (
            <li key={section.key} className="shrink-0">
              <a
                href={`#section-${section.key}`}
                aria-current={active === section.key ? "location" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onJump(section.key);
                }}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium max-lg:border max-lg:border-line max-lg:bg-white",
                  active === section.key ? "bg-navy-100 font-semibold text-navy-900 max-lg:border-navy-200 max-lg:bg-navy-100" : "text-ink hover:bg-navy-50"
                )}
              >
                <Icon
                  className={cn("h-4 w-4 shrink-0", section.state === "complete" ? "text-ok" : section.state === "attention" ? "text-bad" : "text-muted")}
                  aria-hidden="true"
                />
                <span>{section.title}</span>
                <span className="sr-only">{section.state === "complete" ? ", complete" : section.state === "attention" ? ", needs attention" : ", not complete"}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
