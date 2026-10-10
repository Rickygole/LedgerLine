"use client";

import { useActionState } from "react";
import { FilePlus2 } from "lucide-react";
import { createDraftFromPublished } from "@/app/finance/initiatives/[id]/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function CreateDraftForm({
  initiativeId,
  label = "Edit form (creates a draft)",
}: {
  initiativeId: string;
  label?: string;
}) {
  const [state, action, pending] = useActionState(createDraftFromPublished, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        <FilePlus2 className="h-4 w-4" aria-hidden="true" />
        {pending ? "Creating draft" : label}
      </Button>
      <div role="alert">
        <FieldError>{state?.error}</FieldError>
      </div>
    </form>
  );
}
