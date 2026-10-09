"use client";

import { AlertCircle, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/cn";

export type NavSection = { key: string; title: string; state: "complete" | "attention" | "todo" };

export function SectionNav({ sections, active, onJump }: { sections: NavSection[]; active: string; onJump: (key: string) => void }) {
  const done = sections.filter((section) => section.state === "complete").length;
  return (
    <nav aria-label="Report sections" className="no-print">
      <p className="mb-2 hidden text-xs font-semibold uppercase tracking-wide text-muted lg:block">
        {done} of {sections.length} sections complete
      </p>
      <div className="mb-3 hidden h-1.5 overflow-hidden rounded-full bg-line lg:block" aria-hidden="true">
        <div className="h-full bg-ok transition-all" style={{ width: `${Math.round((done / sections.length) * 100)}%` }} />
      </div>
      <ol className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
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
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                  active === section.key ? "bg-navy-100 text-navy-900" : "text-ink hover:bg-navy-50"
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
