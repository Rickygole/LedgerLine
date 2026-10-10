import { BOROUGH_SHAPES, COUNCIL_DISTRICT_SHAPES, GEO_VIEWBOX } from "@/lib/geo";
import { MAP_ACTION } from "./geo-colors";

export function MiniDistrictMap({
  fills,
  outlined = [],
  label,
  className,
}: {
  fills: Record<number, string>;
  outlined?: number[];
  label: string;
  className?: string;
}) {
  const ring = new Set(outlined);
  return (
    <svg
      viewBox={GEO_VIEWBOX}
      role="img"
      aria-label={label}
      className={className ?? "block h-auto w-[200px] max-w-full"}
    >
      {COUNCIL_DISTRICT_SHAPES.map((d) => (
        <path
          key={d.district}
          d={d.path}
          fill={fills[d.district] ?? "#eef2f6"}
          stroke="#fff"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      ))}
      {BOROUGH_SHAPES.map((b) => (
        <path key={b.borough} d={b.path} fill="none" stroke="#a9aeb1" strokeWidth={1.2} strokeLinejoin="round" />
      ))}
      {COUNCIL_DISTRICT_SHAPES.filter((d) => ring.has(d.district)).map((d) => (
        <path
          key={`ring-${d.district}`}
          d={d.path}
          fill="none"
          stroke={MAP_ACTION}
          strokeWidth={10}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
