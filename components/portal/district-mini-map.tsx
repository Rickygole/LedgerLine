import { COUNCIL_DISTRICT_SHAPES, GEO_VIEWBOX } from "@/lib/geo";

export function DistrictMiniMap({ district, borough }: { district: number | null; borough: string }) {
  const label = district
    ? `Map of New York City Council districts with District ${district} in ${borough} highlighted`
    : "Map of New York City Council districts";
  return (
    <figure className="w-full max-w-[220px]">
      <svg viewBox={GEO_VIEWBOX} role="img" aria-label={label} className="h-auto w-full">
        {COUNCIL_DISTRICT_SHAPES.map((shape) => (
          <path
            key={shape.district}
            d={shape.path}
            fill={shape.district === district ? "#1f4e85" : "#e5edf7"}
            stroke="#fff"
            strokeWidth={2}
          />
        ))}
      </svg>
      <figcaption className="mt-2 text-sm text-muted">
        {district
          ? `Council District ${district}, ${borough}. Your organization's location.`
          : "No Council district on file."}
        <span className="block text-[12.5px]">District boundaries: NYC Department of City Planning.</span>
      </figcaption>
    </figure>
  );
}
