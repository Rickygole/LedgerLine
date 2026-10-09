"use client";

import { useActionState } from "react";
import { resolveFlagAction } from "@/app/finance/submissions/[id]/actions";
import { Button } from "@/components/ui/button";

export function FlagResolve({ submissionId, flagId }: { submissionId: string; flagId: string }) {
  const [state, action, pending] = useActionState(resolveFlagAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="submissionId" value={submissionId} />
      <input type="hidden" name="flagId" value={flagId} />
      <Button type="submit" name="outcome" value="resolved" size="sm" variant="secondary" disabled={pending}>
        Resolve
      </Button>
      <Button type="submit" name="outcome" value="dismissed" size="sm" variant="ghost" disabled={pending}>
        Dismiss
      </Button>
      {state && !state.ok ? (
        <span role="alert" className="text-sm font-semibold text-bad">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
