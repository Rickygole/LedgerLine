"use client";

import { AlertTriangle } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/format";

type SummaryItem = { target?: string; message: string };

export function focusField(targetId: string) {
  const element = document.getElementById(targetId);
  if (!element) return;
  const focusable = element.matches("input, select, textarea, button")
    ? element
    : element.querySelector<HTMLElement>("input, select, textarea, button");
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  (focusable ?? element).focus({ preventScroll: true });
}

export function problemsTitle(count: number, before = "you submit") {
  return `Fix ${count} ${plural(count, "problem", "problems")} before ${before}`;
}

export const ErrorSummary = forwardRef<HTMLDivElement, { title: string; items: SummaryItem[]; className?: string }>(
  function ErrorSummary({ title, items, className }, ref) {
    if (items.length === 0) return null;
    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        aria-labelledby="error-summary-title"
        className={cn(
          "mb-6 rounded-lg border border-l-4 border-line border-l-bad bg-white px-5 py-4 shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-bad/30",
          className,
        )}
      >
        <h2 id="error-summary-title" className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <AlertTriangle className="h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
          {title}
        </h2>
        <ul className="mt-2 space-y-1 pl-6 text-sm">
          {items.map((item, index) => (
            <li key={`${item.target ?? "x"}-${index}`} className="list-disc text-ink marker:text-bad">
              {item.target ? (
                <a
                  href={`#${item.target}`}
                  className="font-medium text-navy-700 underline underline-offset-2 hover:text-navy-900"
                  onClick={(event) => {
                    event.preventDefault();
                    focusField(item.target!);
                  }}
                >
                  {item.message}
                </a>
              ) : (
                item.message
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  },
);
