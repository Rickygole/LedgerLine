"use client";

import Link from "next/link";
import { useState } from "react";
import { FOCUS_RING, GEO_BIN_LABEL, GEO_FILL, MAP_INK } from "./geo-colors";

export type MapDistrict = {
  district: number;
  path: string;
  bin: 0 | 1 | 2 | 3 | 4;
  href: string | null;
  dim: boolean;
  member: string | null;
  boroughs: string;
  due: number;
  missing: number;
  share: number;
  waiting: number;
  label: string;
};

export function DistrictMapView({
  viewBox,
  districts,
  outlines,
  initial,
  caption,
}: {
  viewBox: string;
  districts: MapDistrict[];
  outlines: string[];
  initial: number | null;
  caption: string;
}) {
  const [active, setActive] = useState<number | null>(initial);
  const [focused, setFocused] = useState<number | null>(null);
  const current = districts.find((d) => d.district === active) ?? null;
  const ring = districts.find((d) => d.district === focused) ?? null;
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_13rem] md:items-start">
      <svg viewBox={viewBox} className="block h-auto w-full max-w-[520px]" role="group" aria-label={caption}>
        {districts.map((d) => {
          const shape = (
            <path
              d={d.path}
              fill={GEO_FILL[d.bin]}
              stroke="#fff"
              strokeWidth={1.2}
              strokeLinejoin="round"
              opacity={d.dim ? 0.25 : 1}
              className="transition-[fill,opacity] duration-[120ms] ease-out motion-reduce:transition-none"
            />
          );
          if (!d.href)
            return (
              <g key={d.district} aria-hidden="true">
                {shape}
              </g>
            );
          return (
            <a
              key={d.district}
              href={d.href}
              aria-label={d.label}
              className="cursor-pointer"
              style={{ outline: "none" }}
              onMouseEnter={() => setActive(d.district)}
              onFocus={(event) => {
                setActive(d.district);
                if (event.currentTarget.matches(":focus-visible")) setFocused(d.district);
              }}
              onBlur={() => setFocused((f) => (f === d.district ? null : f))}
            >
              {shape}
            </a>
          );
        })}
        <g aria-hidden="true" pointerEvents="none">
          {outlines.map((path, i) => (
            <path key={i} d={path} fill="none" stroke="#a9aeb1" strokeWidth={1} strokeLinejoin="round" />
          ))}
          {current && !current.dim && current !== ring ? (
            <path d={current.path} fill="none" stroke={MAP_INK} strokeWidth={2.5} strokeLinejoin="round" />
          ) : null}
          {ring ? (
            <>
              <path d={ring.path} fill="none" stroke={FOCUS_RING} strokeWidth={5} strokeLinejoin="round" />
              <path d={ring.path} fill="none" stroke={MAP_INK} strokeWidth={2.5} strokeLinejoin="round" />
            </>
          ) : null}
        </g>
      </svg>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-ink">Share of reports missing</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink">
            {GEO_BIN_LABEL.map((label, bin) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-4 border border-line"
                  style={{ background: GEO_FILL[bin] }}
                />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div
          aria-live="polite"
          className="min-h-[8.5rem] border-l-4 border-harbor-900 bg-white py-2 pl-3 pr-2 text-sm leading-5 ring-1 ring-inset ring-line"
        >
          {current ? (
            <>
              <p className="font-bold text-ink">District {current.district}</p>
              <p className="text-ink">
                {current.member ? `Council Member ${current.member}` : "No Council Member on file"}
              </p>
              <p className="text-muted">{current.boroughs}</p>
              <p className="mt-1 text-ink">
                {current.due === 0 ? (
                  "No reports due"
                ) : (
                  <>
                    <span className={current.missing > 0 ? "num font-bold text-bad" : "num font-bold"}>
                      {current.missing}
                    </span>{" "}
                    of <span className="num">{current.due}</span> missing
                    {current.missing > 0 ? <span className="num text-muted"> ({current.share} percent)</span> : null}
                  </>
                )}
              </p>
              {current.href && current.due > 0 ? (
                <Link
                  href={current.href}
                  className="mt-1 inline-block font-semibold text-link underline underline-offset-2 hover:text-link-hover"
                >
                  View these reports<span className="sr-only"> for District {current.district}</span>
                </Link>
              ) : null}
            </>
          ) : (
            <p className="text-muted">Point to or tab to a district to see its Council Member and report counts.</p>
          )}
        </div>
      </div>
    </div>
  );
}
