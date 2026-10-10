"use client";

import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { addOrganization } from "@/app/finance/organizations/actions";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Select } from "@/components/ui/field";
import { ErrorSummary } from "@/components/finance/admin/error-summary";
import { ORG_TYPES, REPORT_BOROUGHS } from "@/lib/domain";
import { FIELD_LABEL, MASTER_FIELDS, type MasterField } from "@/lib/finance/admin/master-list";

export function AddOrganizationForm() {
  const [state, action, pending] = useActionState(addOrganization, undefined);
  const fe = (state?.fieldErrors ?? {}) as Partial<Record<MasterField, string>>;
  const values = state?.values ?? {};
  const summary = [
    ...(state?.error && Object.keys(fe).length === 0 ? [{ id: "", message: state.error }] : []),
    ...MASTER_FIELDS.filter((field) => fe[field]).map((field) => ({ id: `org-${field}`, message: fe[field]! })),
  ];
  const field = (name: MasterField) => ({
    id: `org-${name}`,
    name,
    defaultValue: values[name],
    "aria-invalid": fe[name] ? (true as const) : undefined,
    "aria-describedby": fe[name] ? `org-${name}-error` : undefined,
  });
  return (
    <form action={action} noValidate className="space-y-6 px-6 py-5">
      <ErrorSummary errors={summary} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="org-ein">{FIELD_LABEL.ein}</Label>
          <Hint id="org-ein-hint">Nine digits. Each EIN can appear on the master list once.</Hint>
          <Input {...field("ein")} className="font-mono" inputMode="numeric" maxLength={11} aria-required="true" />
          <FieldError id="org-ein-error">{fe.ein}</FieldError>
        </div>
        <div>
          <Label htmlFor="org-legal_name">{FIELD_LABEL.legal_name}</Label>
          <Hint id="org-legal_name-hint">As it appears on the IRS determination letter.</Hint>
          <Input {...field("legal_name")} maxLength={160} aria-required="true" />
          <FieldError id="org-legal_name-error">{fe.legal_name}</FieldError>
        </div>
        <div>
          <Label htmlFor="org-org_type">{FIELD_LABEL.org_type}</Label>
          <Select {...field("org_type")} aria-required="true" defaultValue={values.org_type ?? ""}>
            <option value="" disabled>
              Choose a type
            </option>
            {ORG_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <FieldError id="org-org_type-error">{fe.org_type}</FieldError>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="org-borough">{FIELD_LABEL.borough}</Label>
            <Select {...field("borough")} aria-required="true" defaultValue={values.borough ?? ""}>
              <option value="" disabled>
                Choose
              </option>
              {REPORT_BOROUGHS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
            <FieldError id="org-borough-error">{fe.borough}</FieldError>
          </div>
          <div>
            <Label htmlFor="org-council_district">{FIELD_LABEL.council_district}</Label>
            <Input {...field("council_district")} inputMode="numeric" maxLength={2} className="num" />
            <FieldError id="org-council_district-error">{fe.council_district}</FieldError>
          </div>
        </div>
        <div>
          <Label htmlFor="org-address_line">{FIELD_LABEL.address_line}</Label>
          <Input {...field("address_line")} maxLength={200} aria-required="true" />
          <FieldError id="org-address_line-error">{fe.address_line}</FieldError>
        </div>
        <div>
          <Label htmlFor="org-postal_code">{FIELD_LABEL.postal_code}</Label>
          <Input {...field("postal_code")} inputMode="numeric" maxLength={10} className="num" aria-required="true" />
          <FieldError id="org-postal_code-error">{fe.postal_code}</FieldError>
        </div>
      </div>
      <fieldset className="space-y-4 border-t border-line-soft pt-5">
        <legend className="text-base font-bold text-ink">Primary contact</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="org-contact_name">Name</Label>
            <Input {...field("contact_name")} maxLength={120} aria-required="true" />
            <FieldError id="org-contact_name-error">{fe.contact_name}</FieldError>
          </div>
          <div>
            <Label htmlFor="org-contact_title">Title</Label>
            <Input {...field("contact_title")} maxLength={120} aria-required="true" />
            <FieldError id="org-contact_title-error">{fe.contact_title}</FieldError>
          </div>
          <div>
            <Label htmlFor="org-contact_email">Email</Label>
            <Input {...field("contact_email")} type="email" maxLength={254} aria-required="true" />
            <FieldError id="org-contact_email-error">{fe.contact_email}</FieldError>
          </div>
          <div>
            <Label htmlFor="org-contact_phone" optional>
              Phone
            </Label>
            <Input {...field("contact_phone")} type="tel" maxLength={20} />
            <FieldError id="org-contact_phone-error">{fe.contact_phone}</FieldError>
          </div>
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Building2 className="h-4 w-4" aria-hidden="true" />
          {pending ? "Adding" : "Add organization"}
        </Button>
        <p className="text-sm text-muted">
          The organization is checked against this list when a report is submitted. Create its sign-in accounts from
          Users.
        </p>
      </div>
    </form>
  );
}
