"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BUCKET_LABEL, type Bucket } from "@/lib/reporting";
import { ChartFrame, CHART_COLORS } from "./chart-frame";

export type BoroughDatum = { borough: string } & Record<Bucket, number>;

const STACK: Bucket[] = ["accepted", "in_review", "submitted", "returned", "incomplete", "missing", "outstanding"];

export function StatusByBoroughChart({ data, periodLabel }: { data: BoroughDatum[]; periodLabel: string }) {
  const series = data.map((d) => ({ ...d }));
  return (
    <ChartFrame
      title="Report status by borough"
      description={`Expected reports for ${periodLabel}, stacked by where each one stands.`}
      caption="Synthetic demo data. Not NYC Council records."
      table={
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-muted">
              <th scope="col" className="py-1.5 pr-3 font-semibold">Borough</th>
              {STACK.map((b) => (
                <th key={b} scope="col" className="num px-2 py-1.5 text-right font-semibold">{BUCKET_LABEL[b]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.borough} className="border-b border-line last:border-0">
                <th scope="row" className="py-1.5 pr-3 font-medium">{d.borough}</th>
                {STACK.map((b) => (
                  <td key={b} className="num px-2 py-1.5 text-right">{d[b]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div role="img" aria-label={`Stacked bar chart of report status by borough for ${periodLabel}. A data table follows the chart.`}>
        <ResponsiveContainer width="100%" height={320} initialDimension={{ width: 640, height: 320 }}>
          <BarChart data={series} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid vertical={false} stroke="#E4E7EC" />
            <XAxis dataKey="borough" tick={{ fontSize: 12, fill: "#344054" }} tickLine={false} label={{ value: "Borough", position: "insideBottom", offset: -14, fontSize: 12, fill: "#475467" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#344054" }} tickLine={false} axisLine={false} label={{ value: "Reports", angle: -90, position: "insideLeft", fontSize: 12, fill: "#475467" }} />
            <Tooltip cursor={{ fill: "rgba(16,24,40,0.04)" }} />
            <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
            {STACK.map((bucket) => (
              <Bar key={bucket} dataKey={bucket} name={BUCKET_LABEL[bucket]} stackId="status" fill={CHART_COLORS[bucket]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
