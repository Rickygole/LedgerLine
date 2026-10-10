import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Eye, FileText, Flag, RotateCcw, Send } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";

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
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export type ReportState = "not_started" | "draft" | "submitted" | "under_review" | "returned" | "accepted" | "missing";

const STATE: Record<ReportState, { finance: string; cbo: string; tone: Tone; icon: ComponentType<{ className?: string }> }> = {
  not_started: { finance: "Not started", cbo: "Not started", tone: "neutral", icon: CircleDashed },
  draft: { finance: "Draft", cbo: "In progress", tone: "neutral", icon: FileText },
  submitted: { finance: "Submitted", cbo: "Submitted", tone: "info", icon: Send },
  under_review: { finance: "In review", cbo: "In review", tone: "info", icon: Eye },
  returned: { finance: "Update requested", cbo: "Changes requested", tone: "warn", icon: RotateCcw },
  accepted: { finance: "Accepted", cbo: "Accepted", tone: "ok", icon: CheckCircle2 },
  missing: { finance: "Missing", cbo: "Overdue", tone: "bad", icon: AlertTriangle },
};

export function StateBadge({ state, audience = "finance" }: { state: ReportState; audience?: "finance" | "cbo" }) {
  const s = STATE[state];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {audience === "cbo" ? s.cbo : s.finance}
    </Badge>
  );
}

export function DueBadge({ daysPastDue }: { daysPastDue: number }) {
  if (daysPastDue > 0) return <Badge tone="bad" icon={Clock}>{daysPastDue} {daysPastDue === 1 ? "day" : "days"} past due</Badge>;
  if (daysPastDue > -14) return <Badge tone="warn" icon={Clock}>Due in {Math.abs(daysPastDue)} {Math.abs(daysPastDue) === 1 ? "day" : "days"}</Badge>;
  return null;
}

export function FlagBadge({ label }: { label: string }) {
  return <Badge tone="warn" icon={Flag}>{label}</Badge>;
}

export function AiDraftBadge({ label = "AI draft" }: { label?: string }) {
  return <Badge tone="info" icon={FileText}>{label}</Badge>;
}
