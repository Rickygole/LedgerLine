"use client";

import { AutoFilterForm, ClearFilters, HiddenSubmit, MoreFilters } from "@/components/ui/auto-filter-form";
import { CONTRACT_STATUSES, FUNDING_SOURCES } from "@/lib/finance/awards";
import { REPORT_BOROUGHS } from "@/lib/domain";
import { FLAG_LABEL, FLAG_ORDER } from "@/lib/finance/review/filters";
import type { Filters, PeriodInfo } from "@/lib/finance/review/types";

type Field =
  | "q"
  | "period"
  | "borough"
  | "district"
  | "member"
  | "initiative"
  | "category"
  | "funding"
  | "contract"
  | "agency"
  | "flag";

const control = "block h-10 w-full rounded-sm border border-field bg-white px-3 text-base text-ink sm:text-[15px]";

function Select({
  id,
  name,
  label,
  value,
  children,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className={`${control} pr-8`}>
        {children}
      </select>
    </div>
  );
}

export function SubmissionFilters({
  action,
  filters,
  periods,
  categories,
  members,
  agencies,
  fields,
  keep = {},
  clearHref,
  active,
}: {
  action: string;
  filters: Filters;
  periods: PeriodInfo[];
  categories: string[];
  members: { district: number; name: string }[];
  agencies: string[];
  fields: Field[];
  keep?: Record<string, string>;
  clearHref: string;
  active: boolean;
}) {
  const has = (f: Field) => fields.includes(f);
  const more: Field[] = ["initiative", "category", "funding", "contract", "agency", "flag"];
  const moreApplied = more.filter((f) => has(f) && filters[f]).length;
  const moreCount = more.filter(has).length;
  const top = (["q", "period", "borough", "district", "member"] as Field[]).filter(has).length;

  return (
    <AutoFilterForm action={action} label="Filter reports" className="mb-4 rounded border border-line bg-white p-4">
      {Object.entries(keep)
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      {filters.by && filters.district ? <input type="hidden" name="by" value={filters.by} /> : null}
      <div
        className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${top === 5 ? "lg:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(11.5rem,1fr)_minmax(10rem,1fr)_minmax(13.75rem,1.2fr)_minmax(13.75rem,1.2fr)]" : top === 4 ? "lg:grid-cols-[minmax(0,2fr)_minmax(11.5rem,1fr)_minmax(10rem,1fr)_minmax(13.75rem,1fr)]" : "lg:grid-cols-[minmax(0,2fr)_minmax(11.5rem,1fr)_minmax(10rem,1fr)]"}`}
      >
        {has("q") ? (
          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
            <label htmlFor="f-q" className="mb-1 block text-sm font-semibold text-ink">
              Search
            </label>
            <input
              id="f-q"
              name="q"
              type="search"
              defaultValue={filters.q}
              placeholder="Organization, EIN, reference, contract"
              className={control}
            />
          </div>
        ) : null}
        {has("period") ? (
          <Select id="f-period" name="period" label="Reporting period" value={filters.period}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        ) : null}
        {has("borough") ? (
          <Select id="f-borough" name="borough" label="Borough" value={filters.borough}>
            <option value="">All boroughs</option>
            {REPORT_BOROUGHS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        ) : null}
        {has("district") ? (
          <Select id="f-district" name="district" label="Council district" value={filters.district}>
            <option value="">All districts</option>
            {Array.from({ length: 51 }, (_, i) => i + 1).map((d) => {
              const name = members.find((m) => m.district === d)?.name;
              return (
                <option key={d} value={d}>
                  {name ? `${d} · ${name}` : String(d)}
                </option>
              );
            })}
          </Select>
        ) : null}
        {has("member") ? (
          <Select id="f-member" name="member" label="Council Member sponsor" value={filters.member}>
            <option value="">All sponsors</option>
            {members.map((m) => (
              <option key={m.district} value={m.district}>
                {m.name} (D{m.district})
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        {moreCount > 0 ? (
          <MoreFilters count={moreCount} applied={moreApplied}>
            {has("initiative") ? (
              <div className="min-w-0">
                <label htmlFor="f-initiative" className="mb-1 block text-sm font-semibold text-ink">
                  Initiative
                </label>
                <input
                  id="f-initiative"
                  name="initiative"
                  defaultValue={filters.initiative}
                  placeholder="Name or code"
                  className={control}
                />
              </div>
            ) : null}
            {has("category") ? (
              <Select id="f-category" name="category" label="Category" value={filters.category}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            ) : null}
            {has("funding") ? (
              <Select id="f-funding" name="funding" label="Funding source" value={filters.funding}>
                <option value="">All funding sources</option>
                {FUNDING_SOURCES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            ) : null}
            {has("contract") ? (
              <Select id="f-contract" name="contract" label="Contract status" value={filters.contract}>
                <option value="">All contract statuses</option>
                {CONTRACT_STATUSES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            ) : null}
            {has("agency") ? (
              <Select id="f-agency" name="agency" label="Administering agency" value={filters.agency}>
                <option value="">All agencies</option>
                {agencies.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            ) : null}
            {has("flag") ? (
              <Select id="f-flag" name="flag" label="Flag" value={filters.flag}>
                <option value="">All reports</option>
                <option value="any">Any flag</option>
                {FLAG_ORDER.map((f) => (
                  <option key={f} value={f}>
                    {FLAG_LABEL[f]}
                  </option>
                ))}
              </Select>
            ) : null}
          </MoreFilters>
        ) : null}
        <HiddenSubmit />
        {active ? <ClearFilters href={clearHref} /> : null}
      </div>
    </AutoFilterForm>
  );
}
