"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { CONTRACT_STATUSES, FUNDING_SOURCES } from "@/lib/finance/awards";
import { BOROUGHS, FLAG_LABEL, FLAG_ORDER } from "@/lib/finance/review/filters";
import type { Filters, PeriodInfo } from "@/lib/finance/review/types";

type Field = "q" | "period" | "borough" | "district" | "member" | "initiative" | "category" | "funding" | "contract" | "agency" | "flag";

const control = "block h-10 w-full rounded-sm border border-field bg-white px-3 text-base text-ink sm:text-[15px]";

function Select({ id, name, label, value, children, onChange }: { id: string; name: string; label: string; value: string; children: React.ReactNode; onChange: () => void }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} onChange={onChange} className={`${control} pr-8`}>
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
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const has = (f: Field) => fields.includes(f);
  const submit = () => form.current?.requestSubmit();
  const more: Field[] = ["initiative", "category", "funding", "contract", "agency", "flag"];
  const moreApplied = more.filter((f) => has(f) && filters[f]).length;
  const moreCount = more.filter(has).length;
  const top = (["q", "period", "borough", "district", "member"] as Field[]).filter(has).length;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <Form ref={form} action={action} role="search" aria-label="Filter reports" className="mb-4 rounded border border-line bg-white p-4">
      {Object.entries(keep)
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      {filters.by && filters.district ? <input type="hidden" name="by" value={filters.by} /> : null}
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${top === 5 ? "lg:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(13.75rem,1.2fr)_minmax(13.75rem,1.2fr)]" : top === 4 ? "lg:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(13.75rem,1fr)]" : "lg:grid-cols-[minmax(0,2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]"}`}>
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
              onChange={() => {
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(submit, 450);
              }}
            />
          </div>
        ) : null}
        {has("period") ? (
          <Select id="f-period" name="period" label="Reporting period" value={filters.period} onChange={submit}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        ) : null}
        {has("borough") ? (
          <Select id="f-borough" name="borough" label="Borough" value={filters.borough} onChange={submit}>
            <option value="">All boroughs</option>
            {BOROUGHS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        ) : null}
        {has("district") ? (
          <Select id="f-district" name="district" label="Council district" value={filters.district} onChange={submit}>
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
          <Select id="f-member" name="member" label="Council Member sponsor" value={filters.member} onChange={submit}>
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
          <details className="group min-w-0 flex-1" open={moreApplied > 0}>
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">More filters ({moreCount})</span>
              <span className="hidden group-open:inline">Fewer filters</span>
              {moreApplied > 0 ? <span className="no-underline text-muted">, {moreApplied} applied</span> : null}
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {has("initiative") ? (
                <div className="min-w-0">
                  <label htmlFor="f-initiative" className="mb-1 block text-sm font-semibold text-ink">
                    Initiative
                  </label>
                  <input id="f-initiative" name="initiative" defaultValue={filters.initiative} placeholder="Name or code" className={control} onBlur={(e) => e.currentTarget.value !== filters.initiative && submit()} />
                </div>
              ) : null}
              {has("category") ? (
                <Select id="f-category" name="category" label="Category" value={filters.category} onChange={submit}>
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : null}
              {has("funding") ? (
                <Select id="f-funding" name="funding" label="Funding source" value={filters.funding} onChange={submit}>
                  <option value="">All funding sources</option>
                  {FUNDING_SOURCES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </Select>
              ) : null}
              {has("contract") ? (
                <Select id="f-contract" name="contract" label="Contract status" value={filters.contract} onChange={submit}>
                  <option value="">All contract statuses</option>
                  {CONTRACT_STATUSES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              ) : null}
              {has("agency") ? (
                <Select id="f-agency" name="agency" label="Administering agency" value={filters.agency} onChange={submit}>
                  <option value="">All agencies</option>
                  {agencies.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              ) : null}
              {has("flag") ? (
                <Select id="f-flag" name="flag" label="Flag" value={filters.flag} onChange={submit}>
                  <option value="">All reports</option>
                  <option value="any">Any flag</option>
                  {FLAG_ORDER.map((f) => (
                    <option key={f} value={f}>
                      {FLAG_LABEL[f]}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          </details>
        ) : null}
        <button type="submit" className="sr-only focus:not-sr-only focus:text-sm focus:font-semibold focus:text-link focus:underline">
          Apply filters
        </button>
        {active ? (
          <Link href={clearHref} className="text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover">
            Clear all
          </Link>
        ) : null}
      </div>
    </Form>
  );
}
