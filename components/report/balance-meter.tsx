"use client";

import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { balanceCopy } from "./balance";

const TONE = {
  ok: { box: "border-ok/40 bg-ok-bg", fill: "bg-ok", badge: "bg-ok text-white", icon: CheckCircle2 },
  warn: {
    box: "border-line bg-white",
    fill: "bg-[#c98a0b]",
    badge: "bg-warn-bg text-warn ring-1 ring-inset ring-warn/30",
    icon: AlertTriangle,
  },
  bad: {
    box: "border-bad/40 bg-white",
    fill: "bg-bad",
    badge: "bg-bad-bg text-bad ring-1 ring-inset ring-bad/30",
    icon: AlertCircle,
  },
} as const;

const SPOKEN = {
  ok: "Budget is balanced with the award.",
  warn: "Budget is under the award.",
  bad: "Budget is over the award.",
} as const;

export function BalanceMeter({ total, award, lines }: { total: number; award: number; lines: number }) {
  const balance = balanceCopy(total, award);
  const tone = TONE[lines === 0 ? "warn" : balance.tone];
  const Icon = tone.icon;
  const ratio = award > 0 ? Math.max(0, Math.min(1, total / award)) : 0;
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 rounded border p-4", tone.box)}>
      <p className="num text-[15px] leading-[22px] text-ink">
        Budget total <strong className="font-bold">{formatCurrency(total, { cents: true })}</strong> of{" "}
        <strong className="font-bold">{formatCurrency(award, { cents: true })}</strong> award
      </p>
      <div className="relative h-2.5 min-w-[120px] flex-1 overflow-visible rounded-sm bg-harbor-100" aria-hidden="true">
        <div
          className={cn(
            "h-full w-full origin-left rounded-sm transition-transform duration-200 ease-out motion-reduce:transition-none",
            tone.fill,
          )}
          style={{ transform: `scaleX(${ratio})` }}
        />
        {balance.tone === "bad" ? <span className="absolute -top-1 right-0 h-[18px] w-0.5 bg-ink" /> : null}
      </div>
      {lines === 0 ? null : (
        <p className={cn("num inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm font-bold", tone.badge)}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {balance.text}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {lines === 0 ? "" : SPOKEN[balance.tone]}
      </p>
    </div>
  );
}
