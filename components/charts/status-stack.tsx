"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { AXIS, CHART_COLORS, ChartFrame, ChartLegend, GRID, LABEL_ON_DARK, STACK } from "./chart-frame";

export type StackDatum = { name: string; href: string } & Record<Bucket, number>;

type LabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown };

function segmentLabel(bucket: Bucket) {
  return function SegmentLabel(props: LabelProps) {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const width = Number(props.width ?? 0);
    const height = Number(props.height ?? 0);
    const value = Number(props.value ?? 0);
    if (!value || width < 22) return null;
    return (
      <text x={x + width / 2} y={y + height / 2} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={600} fill={LABEL_ON_DARK[bucket] ? "#ffffff" : "#1c2430"} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </text>
    );
  };
}

const NARROW = "(max-width: 640px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(NARROW);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useNarrow() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(NARROW).matches, () => false);
}

function Tick({ x, y, payload, max }: { x?: number | string; y?: number | string; payload?: { value: string }; max: number }) {
  const full = payload?.value ?? "";
  const short = full.length > max ? `${full.slice(0, max - 1)}…` : full;
  return (
    <text x={Number(x ?? 0) - 8} y={Number(y ?? 0)} dy="0.35em" textAnchor="end" fontSize={AXIS.fontSize} fill="#1c2430">
      <title>{full}</title>
      {short}
    </text>
  );
}

export function StatusStackChart({ title, description, dimension, data, periodLabel, className }: { title: string; description: string; dimension: string; data: StackDatum[]; periodLabel: string; className?: string }) {
  const rows = [...data].map((d) => ({ ...d, total: STACK.reduce((sum, b) => sum + d[b], 0) })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const totals = Object.fromEntries(STACK.map((b) => [b, rows.reduce((sum, r) => sum + r[b], 0)])) as Record<Bucket, number>;
  const height = rows.length * 34 + 56;
  const used = STACK.filter((b) => totals[b] > 0);
  const narrow = useNarrow();

  return (
    <ChartFrame
      title={title}
      description={description}
      className={className}
      source={`Source: LedgerLine reporting data, ${periodLabel}`}
      table={
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">
            {title}, {periodLabel}. Counts of reports.
          </caption>
          <thead className="bg-surface">
            <tr className="text-[11px] uppercase tracking-[0.06em] text-muted">
              <th scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{dimension}</th>
              {used.map((b) => (
                <th key={b} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-semibold">{BUCKET_LABEL[b]}</th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.name} className="border-t border-line">
                <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium">
                  <Link href={d.href} className="font-semibold text-navy-700 hover:underline">{d.name}</Link>
                </th>
                {used.map((b) => (
                  <td key={b} className="num px-3 py-2 text-right">{d[b]}</td>
                ))}
                <td className="num px-3 py-2 text-right font-semibold">{d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ChartLegend totals={totals} className="mb-3" />
      <p className="mb-1 text-xs font-semibold text-muted" aria-hidden="true">{dimension}</p>
      <div role="img" aria-label={`Stacked bar chart: ${title.toLowerCase()} for ${periodLabel}. Open View as table below the chart for the numbers.`}>
        <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, bottom: 24, left: 0 }} barCategoryGap={7}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} label={{ value: "Number of reports", position: "insideBottom", offset: -14, ...AXIS }} />
            <YAxis type="category" dataKey="name" width={narrow ? 112 : 150} tick={<Tick max={narrow ? 13 : 24} />} tickLine={false} axisLine={false} interval={0} />
            <Tooltip cursor={{ fill: "rgba(36,73,124,0.06)" }} contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 12 }} />
            {used.map((bucket) => (
              <Bar key={bucket} dataKey={bucket} name={BUCKET_LABEL[bucket]} stackId="status" fill={CHART_COLORS[bucket]} stroke="#ffffff" strokeWidth={1} isAnimationActive={false}>
                <LabelList dataKey={bucket} content={segmentLabel(bucket)} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
