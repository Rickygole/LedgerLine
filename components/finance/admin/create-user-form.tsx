"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import { createUser } from "@/app/finance/users/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Select } from "@/components/ui/field";
import { ErrorSummary } from "@/components/finance/admin/error-summary";

const ROLE_OPTIONS = [
  { value: "finance_viewer", label: "Finance (view only)" },
  { value: "finance_analyst", label: "Finance analyst" },
  { value: "finance_admin", label: "Finance administrator" },
  { value: "cbo_submitter", label: "Reporting organization" },
];

export function CreateUserForm({ orgs }: { orgs: { id: string; name: string; ein: string }[] }) {
  const [state, action, pending] = useActionState(createUser, undefined);
  const fe = state?.fieldErrors ?? {};
  const [chosenRole, setChosenRole] = useState<string | null>(null);
  const role = chosenRole ?? state?.values?.role ?? "";
  const summary = [...(state?.error ? [{ id: "", message: state.error }] : []), ...Object.entries(fe).map(([key, message]) => ({ id: key === "role" ? "new-user-role" : key, message }))];
  return (
    <form action={action} noValidate className="space-y-4 px-5 py-4" onReset={() => setChosenRole(null)}>
      <ErrorSummary errors={summary} />
      {state?.ok ? (
        <div role="status" className="rounded-md border border-ok/30 bg-ok-bg px-4 py-3 text-sm font-semibold text-ok">
          <p>{state.ok}</p>
          {state.link ? <code data-testid="issued-link" className="mt-1 block break-all font-mono text-xs font-normal text-ink">{state.link}</code> : null}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="fullName" required>
            Full name
          </Label>
          <Input id="fullName" name="fullName" maxLength={120} defaultValue={state?.values?.fullName} aria-invalid={fe.fullName ? true : undefined} aria-describedby={fe.fullName ? "fullName-error" : undefined} />
          <FieldError id="fullName-error">{fe.fullName}</FieldError>
        </div>
        <div>
          <Label htmlFor="email" required>
            Work email
          </Label>
          <Input id="email" name="email" type="email" maxLength={254} defaultValue={state?.values?.email} aria-invalid={fe.email ? true : undefined} aria-describedby={fe.email ? "email-error" : undefined} />
          <FieldError id="email-error">{fe.email}</FieldError>
        </div>
        <div>
          <Label htmlFor="title">Job title</Label>
          <Input id="title" name="title" maxLength={120} defaultValue={state?.values?.title} aria-invalid={fe.title ? true : undefined} aria-describedby={fe.title ? "title-error" : undefined} />
          <FieldError id="title-error">{fe.title}</FieldError>
        </div>
        <div>
          <Label htmlFor="new-user-role" required>
            Role
          </Label>
          <Select key={state?.values?.role ?? ""} id="new-user-role" name="role" defaultValue={state?.values?.role ?? ""} onChange={(event) => setChosenRole(event.target.value)} aria-invalid={fe.role ? true : undefined} aria-describedby={fe.role ? "new-user-role-error" : undefined}>
            <option value="" disabled>
              Choose a role
            </option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
          <FieldError id="new-user-role-error">{fe.role}</FieldError>
        </div>
        {role === "cbo_submitter" ? (
          <div className="md:col-span-2">
            <Label htmlFor="orgId" required>
              Organization
            </Label>
            <Hint id="orgId-hint">The person will see only the reports assigned to this organization.</Hint>
            <Select key={state?.values?.orgId ?? ""} id="orgId" name="orgId" defaultValue={state?.values?.orgId ?? ""} aria-invalid={fe.orgId ? true : undefined} aria-describedby={fe.orgId ? "orgId-hint orgId-error" : "orgId-hint"}>
              <option value="" disabled>
                Choose an organization
              </option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.ein})
                </option>
              ))}
            </Select>
            <FieldError id="orgId-error">{fe.orgId}</FieldError>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Creating" : "Create account"}
        </Button>
        <p className="text-sm text-muted">The person gets a message with a link to set a password. The link works once and expires after 30 minutes.</p>
      </div>
    </form>
  );
}
