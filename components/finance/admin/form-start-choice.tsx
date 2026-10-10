"use client";

import { useActionState } from "react";
import { chooseTemplate } from "@/app/finance/initiatives/new/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function FormStartChoice({ initiativeId }: { initiativeId: string }) {
  const [state, action, pending] = useActionState(chooseTemplate, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="mode" value="import" disabled={pending} className="h-11 px-5 text-base">
          Import a Word template
        </Button>
        <Button type="submit" name="mode" value="standard" variant="secondary" disabled={pending} className="h-11 px-5 text-base">
          {pending ? "Creating draft" : "Start from the standard form"}
        </Button>
      </div>
      <div role="alert">
        <FieldError>{state?.error}</FieldError>
      </div>
    </form>
  );
}
