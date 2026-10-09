"use client";

import { useRef } from "react";
import { Select } from "@/components/ui/field";

export function PeriodSelect({ periods, value }: { periods: { id: string; label: string }[]; value: string }) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} method="get" className="flex items-center gap-2">
      <label htmlFor="period" className="text-sm font-semibold text-ink">
        Reporting period
      </label>
      <Select id="period" name="period" defaultValue={value} className="w-72" onChange={() => form.current?.requestSubmit()}>
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} ({p.id})
          </option>
        ))}
      </Select>
      <noscript>
        <button type="submit" className="h-10 rounded-md border border-line px-3 text-sm font-semibold">Apply</button>
      </noscript>
    </form>
  );
}
