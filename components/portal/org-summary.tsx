import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/rules/money";
import type { OrgProfile } from "@/lib/portal/data";

export function OrgSummary({ org, fiscalYear, activeAwards, totalAwarded }: { org: OrgProfile; fiscalYear: string; activeAwards: number; totalAwarded: number }) {
  const cells: { label: string; value: React.ReactNode }[] = [
    { label: "Legal name", value: <span className="font-semibold">{org.legalName}</span> },
    { label: "EIN", value: <span className="whitespace-nowrap font-mono text-[13px]">{org.ein}</span> },
    { label: "Borough and district", value: `${org.borough}${org.councilDistrict ? `, District ${org.councilDistrict}` : ""}` },
    { label: `${fiscalYear} awards`, value: <span className="num">{activeAwards}</span> },
    { label: `${fiscalYear} total awarded`, value: <span className="num font-semibold">{formatCurrency(totalAwarded)}</span> },
  ];
  return (
    <Card className="mb-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 md:grid-cols-3 xl:grid-cols-5">
        {cells.map((cell) => (
          <div key={cell.label} className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{cell.label}</dt>
            <dd className="mt-1 text-sm text-ink break-words">{cell.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
