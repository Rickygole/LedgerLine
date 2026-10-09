import type { ComponentType } from "react";
import { CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { Badge, StateBadge, type Tone } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/dates";
import { contractLabel, fundingLabel } from "@/lib/finance/awards";
import type { Sponsor } from "@/lib/finance/review/types";
import { reportState } from "@/lib/reporting";

type PeriodCell = { id: string; label: string; due_on: string; status: string | null };

export function AwardPeriods({ periods }: { periods: PeriodCell[] | null }) {
  if (!periods || periods.length === 0) return <span className="text-muted">No report form</span>;
  return (
    <ul className="space-y-1">
      {periods.map((p) => (
        <li key={p.id} className="flex items-center gap-2 whitespace-nowrap">
          <span className="w-16 text-xs text-muted">{p.id.endsWith("-MY") ? "Mid-Year" : "Year-End"}</span>
          <StateBadge state={reportState(p.status, p.due_on)} />
        </li>
      ))}
    </ul>
  );
}

const CONTRACT_TONE: Record<string, Tone> = { registered: "ok", pending: "info", awaiting: "neutral" };
const CONTRACT_ICON: Record<string, ComponentType<{ className?: string }>> = { registered: CheckCircle2, pending: Clock, awaiting: CircleDashed };

export function ContractCell({ status, number, registeredOn, quiet = false }: { status: string; number: string | null; registeredOn: string | null; quiet?: boolean }) {
  if (quiet && status === "registered") {
    return (
      <div className="whitespace-nowrap text-xs text-muted">
        <span className="sr-only">Registered. </span>
        {number ? <div className="font-mono">{number}</div> : null}
        {registeredOn ? <div>{formatDate(registeredOn)}</div> : null}
        {!number && !registeredOn ? <div>Registered</div> : null}
      </div>
    );
  }
  return (
    <div className="whitespace-nowrap">
      <Badge tone={CONTRACT_TONE[status] ?? "neutral"} icon={CONTRACT_ICON[status]}>{contractLabel(status)}</Badge>
      {number ? <div className="mt-1 font-mono text-xs text-muted">{number}</div> : null}
      {registeredOn ? <div className="text-xs text-muted">{formatDate(registeredOn)}</div> : null}
    </div>
  );
}

export function SponsorsCell({ sponsors, source }: { sponsors: Sponsor[] | null; source: string }) {
  const list = sponsors ?? [];
  return (
    <div className="min-w-40">
      <div className="text-xs font-semibold text-muted">{fundingLabel(source)}</div>
      {list.length === 0 ? (
        <span className="text-muted">None recorded</span>
      ) : (
        <ul>
          {list.map((s) => (
            <li key={s.district}>
              {s.name} <span className="text-xs text-muted">District {s.district}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
