import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { STATE_LABEL, type Audience, type ReportState } from "@/lib/domain";
import { plural } from "@/lib/format";

export type Tone = "ok" | "bad" | "warn" | "info" | "neutral" | "ai_draft";

const tones: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok ring-ok/20",
  bad: "bg-bad-bg text-bad ring-bad/20",
  warn: "bg-warn-bg text-warn ring-warn/25",
  info: "bg-info-bg text-info ring-info/20",
  neutral: "bg-white text-ink-2 ring-line-strong",
  ai_draft: "bg-info-bg text-info ring-info/20",
};

export function Badge({ tone = "neutral", icon: Icon, children, className }: { tone?: Tone; icon?: ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[13px] font-semibold leading-5 ring-1 ring-inset whitespace-nowrap", tones[tone], className)}>
      {Icon && (tone === "bad" || tone === "ok") ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export type { ReportState };

const STATE_STYLE: Record<ReportState, { tone: Tone; icon?: ComponentType<{ className?: string }> }> = {
  not_started: { tone: "neutral" },
  draft: { tone: "neutral" },
  submitted: { tone: "info" },
  under_review: { tone: "info" },
  returned: { tone: "warn" },
  accepted: { tone: "ok", icon: CheckCircle2 },
  missing: { tone: "bad", icon: AlertTriangle },
};

export function StateBadge({ state, audience = "finance" }: { state: ReportState; audience?: Audience }) {
  const style = STATE_STYLE[state];
  return (
    <Badge tone={style.tone} icon={style.icon}>
      {STATE_LABEL[state][audience]}
    </Badge>
  );
}

export function DueBadge({ daysPastDue }: { daysPastDue: number }) {
  if (daysPastDue > 0) return <Badge tone="bad" icon={AlertTriangle}>{daysPastDue} {plural(daysPastDue, "day", "days")} past due</Badge>;
  if (daysPastDue > -14) return <Badge tone="warn">Due in {Math.abs(daysPastDue)} {plural(Math.abs(daysPastDue), "day", "days")}</Badge>;
  return null;
}

export function FlagBadge({ label }: { label: string }) {
  return <Badge tone="warn">{label}</Badge>;
}

export function AiDraftBadge({ label = "AI draft" }: { label?: string }) {
  return <Badge tone="info">{label}</Badge>;
}
