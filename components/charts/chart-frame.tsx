export const CHART_COLORS = {
  accepted: "#0072B2",
  in_review: "#56B4E9",
  submitted: "#009E73",
  returned: "#E69F00",
  incomplete: "#D55E00",
  missing: "#CC79A7",
  outstanding: "#8A8F98",
} as const;

export function ChartFrame({ title, description, caption, children, table }: { title: string; description: string; caption: string; children: React.ReactNode; table: React.ReactNode }) {
  return (
    <figure className="rounded-lg border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <figcaption className="mb-3">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </figcaption>
      {children}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-navy-700 hover:underline">View chart data as a table</summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
      <p className="mt-3 text-xs text-muted">{caption}</p>
    </figure>
  );
}
