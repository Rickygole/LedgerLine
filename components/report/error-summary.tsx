"use client";

import { forwardRef } from "react";
import { fieldTargetId } from "@/lib/report/issues";
import type { Issue } from "@/lib/rules/types";

export function focusField(targetId: string) {
  const element = document.getElementById(targetId);
  if (!element) return;
  const focusable = element.matches("input, select, textarea, button") ? element : element.querySelector<HTMLElement>("input, select, textarea, button");
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  (focusable ?? element).focus({ preventScroll: true });
}

export const ErrorSummary = forwardRef<HTMLDivElement, { issues: Issue[] }>(function ErrorSummary({ issues }, ref) {
  return (
    <div ref={ref} tabIndex={-1} role="alert" aria-labelledby="error-summary-title" className="mb-6 rounded-lg border-2 border-bad bg-bad-bg px-5 py-4">
      <h2 id="error-summary-title" className="text-base font-bold text-bad">
        There {issues.length === 1 ? "is 1 problem" : `are ${issues.length} problems`} to fix before you can submit
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {issues.map((issue, index) => {
          const target = fieldTargetId(issue.field);
          return (
            <li key={`${issue.field}-${index}`}>
              <a
                href={`#${target}`}
                className="font-semibold text-bad underline underline-offset-2"
                onClick={(event) => {
                  event.preventDefault();
                  focusField(target);
                }}
              >
                {issue.message}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
