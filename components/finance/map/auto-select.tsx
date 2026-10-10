"use client";

import { useRef } from "react";

export function AutoSelect({
  id,
  name,
  label,
  value,
  options,
  keep,
  action,
  className,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  keep: Record<string, string>;
  action?: string;
  className?: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} method="get" action={action} className={className ?? "flex items-center gap-2"}>
      {Object.entries(keep)
        .filter(([, v]) => v !== "")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <label htmlFor={id} className="whitespace-nowrap text-sm font-semibold text-ink">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        onChange={() => form.current?.requestSubmit()}
        className="block h-9 rounded-sm border border-field bg-white pl-2 pr-8 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="h-9 rounded-sm border border-line px-3 text-sm font-semibold">
          Apply
        </button>
      </noscript>
    </form>
  );
}
