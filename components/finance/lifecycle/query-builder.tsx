"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { saveQuery, type QueryState } from "@/app/finance/queries/actions";
import { BOROUGHS, BUCKET_OPTIONS, CONTRACT_OPTIONS, FLAG_OPTIONS, FUNDING_OPTIONS, ORG_TYPE_OPTIONS, QUERY_KEYS, STATUS_OPTIONS, type MemberOption, type QueryErrors, type QueryParams } from "@/lib/lifecycle/queries";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/field";

type Props = {
  params: QueryParams;
  errors: QueryErrors;
  periods: { id: string; label: string }[];
  categories: string[];
  initiatives: string[];
  members: MemberOption[];
};

export function QueryBuilder({ params, errors, periods, categories, initiatives, members }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState<QueryParams>(params);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, saveAction, saving] = useActionState<QueryState, FormData>(saveQuery, undefined);

  useEffect(() => setValues(params), [params]);

  const push = (next: QueryParams, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const search = new URLSearchParams();
      for (const key of QUERY_KEYS) if (next[key]) search.set(key, next[key] as string);
      start(() => router.replace(`${pathname}?${search.toString()}`, { scroll: false }));
    }, delay);
  };

  const set = (key: keyof QueryParams, value: string, delay = 0) => {
    const next = { ...values, [key]: value };
    setValues(next);
    push(next, delay);
  };

  const select = (id: string, key: keyof QueryParams, label: string, options: { value: string; label: string }[], blank: string) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={values[key] ?? ""} onChange={(e) => set(key, e.target.value)} aria-invalid={errors[key] ? true : undefined} aria-describedby={errors[key] ? `${id}-error` : undefined}>
        <option value="">{blank}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <FieldError id={`${id}-error`}>{errors[key]}</FieldError>
    </div>
  );

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy={pending}>
        {select("q-period", "period", "Reporting period", periods.map((p) => ({ value: p.id, label: p.label })), "Default period")}
        {select("q-category", "category", "Initiative category", categories.map((c) => ({ value: c, label: c })), "All categories")}
        <div>
          <Label htmlFor="q-initiative">Initiative</Label>
          <Input id="q-initiative" list="q-initiative-list" value={values.initiative ?? ""} onChange={(e) => set("initiative", e.target.value, 400)} placeholder="Name or code" aria-invalid={errors.initiative ? true : undefined} aria-describedby={errors.initiative ? "q-initiative-error" : undefined} />
          <FieldError id="q-initiative-error">{errors.initiative}</FieldError>
          <datalist id="q-initiative-list">
            {initiatives.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        {select("q-borough", "borough", "Borough", BOROUGHS.map((b) => ({ value: b, label: b })), "All boroughs")}
        <div>
          <Label htmlFor="q-district">Council district of the organization</Label>
          <Input id="q-district" type="text" inputMode="numeric" value={values.district ?? ""} onChange={(e) => set("district", e.target.value, 400)} placeholder="1 to 51" aria-invalid={errors.district ? true : undefined} aria-describedby={errors.district ? "q-district-error" : undefined} />
          <FieldError id="q-district-error">{errors.district}</FieldError>
        </div>
        {select("q-member", "member", "Sponsoring Council Member", members.map((m) => ({ value: String(m.district), label: `${m.name} (District ${m.district})` })), "All Council Members")}
        {select("q-funding", "funding", "Funding source", FUNDING_OPTIONS, "All funding sources")}
        {select("q-contract", "contract", "Contract status", CONTRACT_OPTIONS, "All contract statuses")}
        {select("q-org-type", "org_type", "Organization type", ORG_TYPE_OPTIONS.map((o) => ({ ...o })), "All types")}
        {select("q-bucket", "bucket", "Status bucket", BUCKET_OPTIONS, "All buckets")}
        {select("q-status", "status", "Report status", STATUS_OPTIONS.map((o) => ({ ...o })), "All statuses")}
        {select("q-flag", "flag", "Flag type", FLAG_OPTIONS.map((o) => ({ ...o })), "No flag filter")}
        <div>
          <Label htmlFor="q-award-min">Award at least</Label>
          <Input id="q-award-min" type="text" inputMode="numeric" value={values.award_min ?? ""} onChange={(e) => set("award_min", e.target.value, 400)} placeholder="Dollars" aria-invalid={errors.award_min ? true : undefined} aria-describedby={errors.award_min ? "q-award-min-error" : undefined} />
          <FieldError id="q-award-min-error">{errors.award_min}</FieldError>
        </div>
        <div>
          <Label htmlFor="q-award-max">Award at most</Label>
          <Input id="q-award-max" type="text" inputMode="numeric" value={values.award_max ?? ""} onChange={(e) => set("award_max", e.target.value, 400)} placeholder="Dollars" aria-invalid={errors.award_max ? true : undefined} aria-describedby={errors.award_max ? "q-award-max-error" : undefined} />
          <FieldError id="q-award-max-error">{errors.award_max}</FieldError>
        </div>
      </div>
      <form action={saveAction} className="mt-6 flex flex-wrap items-start gap-3 border-t border-line pt-5">
        {QUERY_KEYS.map((key) => (
          <input key={key} type="hidden" name={key} value={params[key] ?? ""} />
        ))}
        <div className="min-w-64">
          <Label htmlFor="query-name">Save this query as</Label>
          <Input id="query-name" name="name" maxLength={80} placeholder="Example: Bronx reports past due" aria-invalid={Boolean(saveState?.error)} aria-describedby={saveState?.error ? "query-name-error" : undefined} />
          <FieldError id="query-name-error">{saveState?.error}</FieldError>
        </div>
        <Button type="submit" variant="secondary" disabled={saving} className="mt-7">
          <Save className="h-4 w-4" aria-hidden="true" /> {saving ? "Saving" : "Save query"}
        </Button>
      </form>
    </div>
  );
}
