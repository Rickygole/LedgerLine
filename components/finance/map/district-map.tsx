import Link from "next/link";
import { cn } from "@/lib/cn";
import { binFor, missingShare, rankDistricts, type DistrictStats, type MapMode, type Tally } from "@/lib/finance/district-stats";
import { BOROUGH_SHAPES, COUNCIL_DISTRICT_SHAPES, GEO_VIEWBOX } from "@/lib/geo";
import { districtInBorough, GEO_BOROUGHS } from "@/lib/geo/boroughs";
import { AutoSelect } from "./auto-select";
import { DistrictMapView, type MapDistrict } from "./district-map-view";

export const MAP_SOURCE = "Council district boundaries: NYC Department of City Planning, via NYC Open Data.";

type Common = { stats: DistrictStats; borough: string; periodId: string };

export function districtHref(periodId: string, district: number, mode: MapMode, missing: number) {
  const params = new URLSearchParams({ period: periodId, district: String(district), by: mode });
  if (missing > 0) params.set("bucket", "missing");
  return `/finance/submissions?${params.toString()}`;
}

function dashHref(params: Record<string, string>, hash = "") {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "")).toString();
  return `/finance${query ? `?${query}` : ""}${hash}`;
}

function reportsWord(n: number) {
  return n === 1 ? "report" : "reports";
}

export function DistrictMapCard({ stats, borough, periodId, table, sort }: Common & { table: boolean; sort: "missing" | "district" }) {
  const mode = stats.mode;
  const byNumber = new Map(stats.districts.map((d) => [d.district, d]));
  const top = rankDistricts(stats.districts, borough, 1)[0]?.district ?? null;
  const districts: MapDistrict[] = COUNCIL_DISTRICT_SHAPES.map((shape) => {
    const s = byNumber.get(shape.district)!;
    const dim = borough !== "" && !districtInBorough(shape.district, borough);
    const member = s.member ? `Council Member ${s.member}` : "no Council Member on file";
    return {
      district: shape.district,
      path: shape.path,
      bin: binFor(s.missing, s.due),
      href: dim ? null : districtHref(periodId, shape.district, mode, s.missing),
      dim,
      member: s.member,
      boroughs: s.boroughs,
      due: s.due,
      missing: s.missing,
      share: missingShare(s.missing, s.due),
      waiting: s.waiting,
      label: `District ${shape.district}, ${member}, ${s.due} ${reportsWord(s.due)} due, ${s.missing} missing`,
    };
  });
  const keep = { period: periodId, map: mode === "sponsor" ? "" : mode, borough };
  const tableRows = [...stats.districts]
    .filter((d) => borough === "" || districtInBorough(d.district, borough))
    .sort((a, b) => (sort === "missing" ? b.missing - a.missing || a.district - b.district : a.district - b.district));
  const multiSponsor = mode === "sponsor" && stats.districts.reduce((sum, d) => sum + d.missing, 0) > stats.inDistricts.missing;

  return (
    <section aria-labelledby="map-title" className="min-w-0 rounded border border-line bg-white lg:col-span-7">
      <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
        <h2 id="map-title" className="text-xl font-bold leading-7 text-ink">
          Missing reports by Council district
        </h2>
        <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">
          {mode === "sponsor"
            ? "Reports funded by each Council Member, past due with nothing submitted."
            : "Reports from organizations located in each district, past due with nothing submitted."}
        </p>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Borough">
            <ul className="flex flex-wrap gap-2">
              {["", ...GEO_BOROUGHS].map((b) => {
                const selected = borough === b;
                return (
                  <li key={b || "all"}>
                    <Link
                      href={dashHref({ ...keep, borough: b })}
                      scroll={false}
                      aria-current={selected ? "true" : undefined}
                      className={cn(
                        "inline-flex h-8 items-center rounded border px-3 text-sm font-semibold",
                        selected ? "border-harbor-900 bg-harbor-900 text-white" : "border-line-strong bg-white text-ink hover:bg-harbor-50"
                      )}
                    >
                      {b || "All boroughs"}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <AutoSelect
            id="map-mode"
            name="map"
            label="Show by"
            value={mode}
            keep={{ period: periodId, borough }}
            action="/finance"
            options={[
              { value: "sponsor", label: "Sponsoring Council Member" },
              { value: "location", label: "Organization location" },
            ]}
          />
        </div>

        <DistrictMapView
          viewBox={GEO_VIEWBOX}
          districts={districts}
          outlines={BOROUGH_SHAPES.map((b) => b.path)}
          initial={top}
          caption={`Map of the 51 New York City Council districts, shaded by the share of reports missing${borough ? `, ${borough} highlighted` : ""}. Each district is a link to its reports.`}
        />

        <div className="space-y-1 text-[13px] leading-5 text-muted">
          {mode === "sponsor" ? (
            multiSponsor ? <p>Awards with more than one sponsor count in each sponsoring district.</p> : null
          ) : stats.noDistrict.due > 0 ? (
            <p>
              No district on file: <span className="num">{stats.noDistrict.missing}</span> missing of <span className="num">{stats.noDistrict.due}</span> {reportsWord(stats.noDistrict.due)}.
            </p>
          ) : (
            <p>Every organization has a Council district on file, so the districts add up to all missing reports.</p>
          )}
          <p>{MAP_SOURCE}</p>
        </div>

        <details id="district-table" open={table} className="group border-t border-line-soft pt-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">View as a table</span>
            <span className="hidden group-open:inline">Hide the table</span>
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full table-fixed border-collapse break-words text-[15px] leading-[22px]">
              <caption className="sr-only">Reports by Council district{borough ? ` in ${borough}` : ""}</caption>
              <colgroup>
                <col className="w-[17%]" />
                <col className="w-[25%]" />
                <col className="w-[22%]" />
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="bg-harbor-50 text-left text-sm font-semibold text-ink-2">
                <tr>
                  <th scope="col" aria-sort={sort === "district" ? "ascending" : undefined} className="h-11 px-2">
                    <Link href={dashHref({ ...keep, table: "1", sort: "" }, "#district-table")} scroll={false} className="underline underline-offset-2">
                      District
                    </Link>
                  </th>
                  <th scope="col" className="px-2">Council Member</th>
                  <th scope="col" className="px-2">Borough</th>
                  <th scope="col" className="px-3 text-right">Due</th>
                  <th scope="col" aria-sort={sort === "missing" ? "descending" : undefined} className="px-2 text-right">
                    <Link href={dashHref({ ...keep, table: "1", sort: "missing" }, "#district-table")} scroll={false} className="underline underline-offset-2">
                      Missing
                    </Link>
                  </th>
                  <th scope="col" className="px-2 text-right leading-5">Waiting for review</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((d) => (
                  <tr key={d.district} className="border-b border-line-soft hover:bg-harbor-50">
                    <th scope="row" className="h-11 px-2 text-left font-semibold">
                      <Link href={districtHref(periodId, d.district, mode, d.missing)} className="text-link underline underline-offset-2 hover:text-link-hover">
                        District {d.district}
                      </Link>
                    </th>
                    <td className="px-2">{d.member ?? "Not on file"}</td>
                    <td className="px-2">{d.boroughs}</td>
                    <td className="num px-2 text-right">{d.due}</td>
                    <td className={cn("num px-2 text-right", d.missing > 0 && "font-bold text-bad")}>{d.missing}</td>
                    <td className="num px-2 text-right">{d.waiting}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  );
}

function OffMapLink({ label, tally, href }: { label: string; tally: Tally; href: string }) {
  const text = (
    <>
      <span className="num">{tally.missing}</span> missing of <span className="num">{tally.due}</span>
    </>
  );
  return (
    <span className="whitespace-nowrap">
      {label},{" "}
      {tally.missing > 0 ? (
        <Link href={href} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
          {text}
        </Link>
      ) : (
        text
      )}
    </span>
  );
}

export function DistrictRanking({ stats, borough, periodId }: Common) {
  const ranked = rankDistricts(stats.districts, borough, 8);
  const mode = stats.mode;
  const missingHref = (funding: string) => `/finance/submissions?${new URLSearchParams({ period: periodId, funding, bucket: "missing" }).toString()}`;
  const allHref = dashHref({ period: periodId, map: mode === "sponsor" ? "" : mode, borough, table: "1", sort: "missing" }, "#district-table");
  return (
    <section aria-labelledby="rank-title" className="min-w-0 self-start rounded border border-line bg-white lg:col-span-5">
      <div className="border-b border-line-soft px-5 pb-4 pt-5 sm:px-6">
        <h2 id="rank-title" className="text-xl font-bold leading-7 text-ink">
          Districts with the most missing reports
        </h2>
        {borough ? <p className="mt-0.5 text-[15px] leading-[22px] text-ink-2">{borough} only</p> : null}
      </div>
      {ranked.length === 0 ? (
        <p className="px-6 py-8 text-[15px] text-muted">No reports were due in {borough ? `${borough} districts` : "any district"} for this period.</p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {ranked.map((d) => (
            <li key={d.district} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_110px_64px] sm:px-6">
              <div className="min-w-0">
                <Link href={districtHref(periodId, d.district, mode, d.missing)} className="text-[17px] font-bold leading-6 text-link underline underline-offset-2 hover:text-link-hover">
                  District {d.district}
                </Link>
                <p className="text-[13px] leading-5 text-muted">
                  {d.member ?? "No Council Member on file"} · {d.boroughs}
                </p>
              </div>
              <span aria-hidden="true" className="col-span-2 row-start-2 block h-2 overflow-hidden rounded-sm bg-geo-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <span className="block h-full bg-geo-4" style={{ width: `${d.due === 0 ? 0 : Math.round((d.missing / d.due) * 100)}%` }} />
              </span>
              <p className="num whitespace-nowrap text-right text-[15px] text-ink sm:col-start-3 sm:row-start-1">
                <span className="font-bold">{d.missing}</span> of {d.due}
              </p>
            </li>
          ))}
        </ol>
      )}
      <div className="space-y-3 border-t border-line-soft px-5 py-4 text-[15px] leading-[22px] sm:px-6">
        {mode === "sponsor" ? (
          <p className="text-ink-2">
            Not shown on the map: <OffMapLink label="Citywide initiatives" tally={stats.citywide} href={missingHref("citywide")} /> · <OffMapLink label="Speaker's allocations" tally={stats.speaker} href={missingHref("speaker")} />
          </p>
        ) : null}
        <Link href={allHref} scroll={false} className="inline-block font-semibold text-link underline underline-offset-2 hover:text-link-hover">
          See all 51 districts
        </Link>
      </div>
    </section>
  );
}
