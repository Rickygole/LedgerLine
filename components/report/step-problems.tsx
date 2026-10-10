"use client";

import { AlertTriangle } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";
import type { Issue } from "@/lib/rules/types";

export function problemsHeading(count: number, scope: "report" | "step") {
  const noun = count === 1 ? "problem" : "problems";
  if (scope === "step") return `There ${count === 1 ? "is" : "are"} ${count} ${noun} to fix in this section`;
  return `There ${count === 1 ? "is" : "are"} ${count} ${noun} to fix before you submit`;
}

export const StepProblems = forwardRef<HTMLDivElement, { issues: Issue[]; onSelect: (field: string) => void; scope: "report" | "step"; alert?: boolean }>(function StepProblems({ issues, onSelect, scope, alert = false }, ref) {
  if (issues.length === 0) return null;
  const titleId = `problems-${scope}`;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={alert ? "alert" : "region"}
      aria-labelledby={titleId}
      className={cn("rounded border border-l-4 border-line border-l-bad bg-white p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-bad/30", scope === "step" && "mb-6")}
    >
      <h3 id={titleId} className="flex items-start gap-2 text-[17px] font-bold leading-6 text-ink">
        <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
        {problemsHeading(issues.length, scope)}
      </h3>
      <ul className="mt-3 space-y-1.5 pl-6 text-[15px] leading-[22px]">
        {issues.map((issue, index) => (
          <li key={`${issue.field}-${index}`} className="list-disc text-ink marker:text-bad">
            <a
              href={`#${issue.field}`}
              className="font-semibold text-bad underline underline-offset-2 hover:text-[#912018]"
              onClick={(event) => {
                event.preventDefault();
                onSelect(issue.field);
              }}
            >
              {issue.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
});
