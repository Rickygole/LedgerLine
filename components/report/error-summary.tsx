"use client";

import { forwardRef } from "react";
import { ErrorSummary as Summary, focusField, problemsTitle } from "@/components/ui/error-summary";
import { fieldTargetId } from "@/lib/report/issues";
import type { Issue } from "@/lib/rules/types";

export { focusField };

export const ErrorSummary = forwardRef<HTMLDivElement, { issues: Issue[] }>(function ErrorSummary({ issues }, ref) {
  return (
    <Summary
      ref={ref}
      title={problemsTitle(issues.length)}
      items={issues.map((issue) => ({ target: fieldTargetId(issue.field), message: issue.message }))}
    />
  );
});
