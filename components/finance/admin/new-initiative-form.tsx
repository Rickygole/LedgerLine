"use client";

import { useActionState } from "react";
import { createInitiative } from "@/app/finance/initiatives/new/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { ErrorSummary } from "@/components/finance/admin/error-summary";

export function NewInitiativeForm({ categories, nextCode }: { categories: string[]; nextCode: string }) {
  const [state, action, pending] = useActionState(createInitiative, undefined);
  const fe = state?.fieldErrors ?? {};
  const summary = [...(state?.error ? [{ id: "", message: state.error }] : []), ...Object.entries(fe).map(([key, message]) => ({ id: key, message }))];
  return (
    <form action={action} noValidate className="max-w-2xl space-y-5">
      <ErrorSummary errors={summary} />
      <div>
        <Label htmlFor="name" required>
          Initiative name
        </Label>
        <Hint id="name-hint">Shown to every funded organization. The code {nextCode} is assigned automatically.</Hint>
        <Input id="name" name="name" defaultValue={state?.values?.name} placeholder="Senior Digital Literacy" maxLength={120} aria-invalid={fe.name ? true : undefined} aria-describedby={fe.name ? "name-hint name-error" : "name-hint"} />
        <FieldError id="name-error">{fe.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="category" required>
          Category
        </Label>
        <Select key={state?.values?.category ?? ""} id="category" name="category" defaultValue={state?.values?.category ?? ""} aria-invalid={fe.category ? true : undefined} aria-describedby={fe.category ? "category-error" : undefined}>
          <option value="" disabled>
            Choose a category
          </option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <FieldError id="category-error">{fe.category}</FieldError>
      </div>
      <div>
        <Label htmlFor="description" required>
          Description
        </Label>
        <Textarea id="description" name="description" defaultValue={state?.values?.description} maxLength={1000} aria-invalid={fe.description ? true : undefined} aria-describedby={fe.description ? "description-error" : undefined} />
        <FieldError id="description-error">{fe.description}</FieldError>
      </div>
      <p className="text-sm text-muted">The initiative is created for fiscal year FY27 with no funding until you assign organizations in the next step.</p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating" : "Create and continue"}
        </Button>
        <ButtonLink href="/finance/initiatives" variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
