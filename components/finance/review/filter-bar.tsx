import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { CONTRACT_STATUSES, FUNDING_SOURCES } from "@/lib/finance/awards";
import { FLAG_LABEL, FLAG_ORDER, BOROUGHS, STATUS_OPTIONS } from "@/lib/finance/review/filters";
import { BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { BUCKET_ORDER } from "@/lib/finance/review/derive";
import type { Filters, PeriodInfo } from "@/lib/finance/review/types";

export function FilterBar({
  action,
  filters,
  periods,
  categories,
  members = [],
  agencies = [],
  fields,
  clearHref,
}: {
  action: string;
  filters: Filters;
  periods: PeriodInfo[];
  categories: string[];
  members?: { district: number; name: string }[];
  agencies?: string[];
  fields: ("q" | "initiative" | "category" | "borough" | "period" | "bucket" | "status" | "flag" | "member" | "funding" | "contract" | "agency")[];
  clearHref: string;
}) {
  const has = (f: (typeof fields)[number]) => fields.includes(f);
  return (
    <form method="get" action={action} role="search" aria-label="Filter reports" className="mb-4 rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {has("q") ? (
          <div>
            <Label htmlFor="f-q">Search</Label>
            <Input id="f-q" name="q" defaultValue={filters.q} placeholder="Reference, EIN, organization, contract" />
          </div>
        ) : null}
        {has("initiative") ? (
          <div>
            <Label htmlFor="f-initiative">Initiative</Label>
            <Input id="f-initiative" name="initiative" defaultValue={filters.initiative} placeholder="Name or code" />
          </div>
        ) : null}
        {has("category") ? (
          <div>
            <Label htmlFor="f-category">Category</Label>
            <Select id="f-category" name="category" defaultValue={filters.category}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("borough") ? (
          <div>
            <Label htmlFor="f-borough">Borough</Label>
            <Select id="f-borough" name="borough" defaultValue={filters.borough}>
              <option value="">All boroughs</option>
              {BOROUGHS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("member") ? (
          <div>
            <Label htmlFor="f-member">Council Member</Label>
            <Select id="f-member" name="member" defaultValue={filters.member}>
              <option value="">All Council Members</option>
              {members.map((m) => (
                <option key={m.district} value={m.district}>{m.name} (District {m.district})</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("funding") ? (
          <div>
            <Label htmlFor="f-funding">Funding source</Label>
            <Select id="f-funding" name="funding" defaultValue={filters.funding}>
              <option value="">All funding sources</option>
              {FUNDING_SOURCES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("contract") ? (
          <div>
            <Label htmlFor="f-contract">Contract status</Label>
            <Select id="f-contract" name="contract" defaultValue={filters.contract}>
              <option value="">All contract statuses</option>
              {CONTRACT_STATUSES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("agency") ? (
          <div>
            <Label htmlFor="f-agency">Administering agency</Label>
            <Select id="f-agency" name="agency" defaultValue={filters.agency}>
              <option value="">All agencies</option>
              {agencies.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("period") ? (
          <div>
            <Label htmlFor="f-period">Reporting period</Label>
            <Select id="f-period" name="period" defaultValue={filters.period}>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>{p.label} ({p.id})</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("bucket") ? (
          <div>
            <Label htmlFor="f-bucket">Bucket</Label>
            <Select id="f-bucket" name="bucket" defaultValue={filters.bucket}>
              <option value="">All buckets</option>
              {BUCKET_ORDER.map((b: Bucket) => (
                <option key={b} value={b}>{BUCKET_LABEL[b]}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("status") ? (
          <div>
            <Label htmlFor="f-status">Status</Label>
            <Select id="f-status" name="status" defaultValue={filters.status}>
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </div>
        ) : null}
        {has("flag") ? (
          <div>
            <Label htmlFor="f-flag">Flag</Label>
            <Select id="f-flag" name="flag" defaultValue={filters.flag}>
              <option value="">All reports</option>
              <option value="any">Any flag</option>
              {FLAG_ORDER.map((f) => (
                <option key={f} value={f}>{FLAG_LABEL[f]}</option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
      {!has("bucket") && filters.bucket ? <input type="hidden" name="bucket" value={filters.bucket} /> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm">
          <Search className="h-4 w-4" aria-hidden="true" />
          Apply filters
        </Button>
        <Link href={clearHref} className="text-sm font-semibold text-navy-700 hover:underline">
          Clear filters
        </Link>
      </div>
    </form>
  );
}
