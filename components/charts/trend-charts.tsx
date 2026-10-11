"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GroupPoint, MonthPoint } from "@/lib/finance/trends";
import { plural } from "@/lib/format";
import { AXIS, ChartFrame, GRID } from "./chart-frame";

const ON_TIME = "#0072B2";
const LATE = "#B84F00";

function monthTick(d: MonthPoint): string {
  return d.partial ? `${d.label} (${d.partial})` : d.label;
}

export function MonthlyTrendChart({
  data,
  periodLabel,
  description,
  source,
}: {
  data: MonthPoint[];
  periodLabel: string;
  description: string;
  source: string;
}) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const rows = data.map((d) => ({ ...d, tick: monthTick(d) }));
  const partial = data.find((d) => d.partial);
  return (
    <ChartFrame
      title={`${periodLabel} reports submitted each month`}
      description={description}
      source={source}
      table={
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">{periodLabel} reports submitted each month, on time and late.</caption>
          <thead className="bg-surface">
            <tr className="text-[13px] text-muted">
              <th scope="col" className="px-3 py-2 font-semibold">
                Month
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                On time
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Late
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t border-line">
                <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium">
                  {monthTick(d)}
                </th>
                <td className="num px-3 py-2 text-right">{d.onTime}</td>
                <td className="num px-3 py-2 text-right">{d.late}</td>
                <td className="num px-3 py-2 text-right font-semibold">{d.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No submitted reports match these filters.</p>
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-hidden="true">
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ON_TIME }} />
              <span className="text-ink">On time</span>
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LATE }} />
              <span className="text-ink">Late</span>
            </li>
            <li>
              <span className="num">{total}</span> {plural(total, "report")} in total
            </li>
          </ul>
          <div
            role="img"
            aria-label={`Bar chart of ${periodLabel} reports submitted each month, on time and late. Open View as table for the numbers.`}
          >
            <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 640, height: 280 }}>
              <BarChart data={rows} margin={{ top: 20, right: 16, bottom: 8, left: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="tick" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
                <YAxis
                  allowDecimals={false}
                  domain={[0, "auto"]}
                  tick={AXIS}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  cursor={{ fill: "rgba(36,73,124,0.06)" }}
                  contentStyle={{ borderRadius: 4, borderColor: GRID, fontSize: 12 }}
                />
                <Bar dataKey="onTime" name="On time" fill={ON_TIME} isAnimationActive={false}>
                  <LabelList dataKey="onTime" position="top" fontSize={12} fill="#1c2430" />
                </Bar>
                <Bar dataKey="late" name="Late" fill={LATE} isAnimationActive={false}>
                  <LabelList dataKey="late" position="top" fontSize={12} fill="#1c2430" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {partial ? (
            <p className="mt-2 text-xs text-muted">
              {partial.label} is not over yet. It counts {partial.partial?.replace(" to ", " through ")} only.
            </p>
          ) : null}
        </>
      )}
    </ChartFrame>
  );
}

export function ComparisonChart({
  data,
  dimension,
  periodLabel,
  source,
}: {
  data: GroupPoint[];
  dimension: string;
  periodLabel: string;
  source: string;
}) {
  const height = data.length * 30 + 56;
  return (
    <ChartFrame
      title={`Share of reports submitted, by ${dimension.toLowerCase()}`}
      description={`Reports submitted or accepted as a share of reports due for ${periodLabel}.`}
      source={source}
      table={
        <table className="w-full min-w-[28rem] text-left text-sm">
          <caption className="sr-only">
            Share of reports submitted by {dimension.toLowerCase()} for {periodLabel}.
          </caption>
          <thead className="bg-surface">
            <tr className="text-[13px] text-muted">
              <th scope="col" className="px-3 py-2 font-semibold">
                {dimension}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Due
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Submitted
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Accepted
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Share submitted
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.name} className="border-t border-line">
                <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium">
                  {d.name}
                </th>
                <td className="num px-3 py-2 text-right">{d.due}</td>
                <td className="num px-3 py-2 text-right">{d.submitted}</td>
                <td className="num px-3 py-2 text-right">{d.accepted}</td>
                <td className="num px-3 py-2 text-right font-semibold">{d.share}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No reports are due for these filters.</p>
      ) : (
        <div
          role="img"
          aria-label={`Bar chart of the share of reports submitted by ${dimension.toLowerCase()} for ${periodLabel}. Open View as table for the numbers.`}
        >
          <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 640, height }}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 24, left: 0 }}
              barCategoryGap={7}
            >
              <CartesianGrid horizontal={false} stroke={GRID} />
              <XAxis
                type="number"
                domain={[0, 100]}
                unit="%"
                tick={AXIS}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                label={{ value: "Share of reports submitted", position: "insideBottom", offset: -14, ...AXIS }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={150}
                tick={{ fontSize: 12, fill: "#1c2430" }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "rgba(36,73,124,0.06)" }}
                contentStyle={{ borderRadius: 4, borderColor: GRID, fontSize: 12 }}
                formatter={(value) => `${value}%`}
              />
              <Bar dataKey="share" name="Share submitted" fill={ON_TIME} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartFrame>
  );
}
