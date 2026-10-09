"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartFrame, CHART_COLORS } from "./chart-frame";

export type CategoryDatum = { category: string; expected: number; submitted: number; rate: number };

export function CompletionByCategoryChart({ data, periodLabel }: { data: CategoryDatum[]; periodLabel: string }) {
  const height = Math.max(240, data.length * 30 + 70);
  return (
    <ChartFrame
      title="Completion rate by initiative category"
      description={`Share of expected ${periodLabel} reports that have been submitted, in review, returned or accepted.`}
      caption="Synthetic demo data. Not NYC Council records."
      table={
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase text-muted">
              <th scope="col" className="py-1.5 pr-3 font-semibold">Category</th>
              <th scope="col" className="num px-2 py-1.5 text-right font-semibold">Expected</th>
              <th scope="col" className="num px-2 py-1.5 text-right font-semibold">Submitted</th>
              <th scope="col" className="num px-2 py-1.5 text-right font-semibold">Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.category} className="border-b border-line last:border-0">
                <th scope="row" className="py-1.5 pr-3 font-medium">{d.category}</th>
                <td className="num px-2 py-1.5 text-right">{d.expected}</td>
                <td className="num px-2 py-1.5 text-right">{d.submitted}</td>
                <td className="num px-2 py-1.5 text-right">{d.rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div role="img" aria-label={`Bar chart of completion rate by initiative category for ${periodLabel}. A data table follows the chart.`}>
        <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 44, bottom: 28, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="#E4E7EC" />
            <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 12, fill: "#344054" }} tickLine={false} label={{ value: "Completion rate (percent of expected reports)", position: "insideBottom", offset: -16, fontSize: 12, fill: "#475467" }} />
            <YAxis type="category" dataKey="category" width={140} tick={{ fontSize: 12, fill: "#344054" }} tickLine={false} />
            <Tooltip cursor={{ fill: "rgba(16,24,40,0.04)" }} formatter={(value) => [`${value}%`, "Completion rate"]} />
            <Bar dataKey="rate" name="Completion rate" fill={CHART_COLORS.accepted} radius={[0, 3, 3, 0]} isAnimationActive={false}>
              <LabelList dataKey="rate" position="right" formatter={(value) => `${value}%`} style={{ fontSize: 12, fill: "#101828" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
