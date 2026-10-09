"use client";

import { useActionState } from "react";
import { FileText, Upload } from "lucide-react";
import { chooseTemplate } from "@/app/finance/initiatives/new/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";

export function TemplateChoiceForm({ initiativeId }: { initiativeId: string }) {
  const [state, action, pending] = useActionState(chooseTemplate, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="initiativeId" value={initiativeId} />
      <div role="alert">
        <FieldError>{state?.error}</FieldError>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-line bg-white p-5">
          <FileText className="h-6 w-6 text-navy-700" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold">Start from the standard template</h3>
          <p className="mt-1 flex-1 text-sm text-muted">Organization details, participants served, narrative and budget sections that every initiative shares. You can add questions specific to this initiative in the form editor.</p>
          <Button type="submit" name="mode" value="standard" className="mt-4" disabled={pending}>
            {pending ? "Creating draft" : "Use the standard template"}
          </Button>
        </div>
        <div className="flex flex-col rounded-lg border border-line bg-white p-5">
          <Upload className="h-6 w-6 text-navy-700" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold">Import a legacy Word template</h3>
          <p className="mt-1 flex-1 text-sm text-muted">Upload the Word document the Council has used so far. LedgerLine reads its headings and tables into a draft form that you review before publishing.</p>
          <Button type="submit" name="mode" value="import" variant="secondary" className="mt-4" disabled={pending}>
            Import a Word template
          </Button>
        </div>
      </div>
    </form>
  );
}
