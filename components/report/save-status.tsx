"use client";

import { AlertTriangle, CheckCircle2, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { savedAtLabel } from "@/lib/report/format";
import type { SaveState } from "@/lib/report/use-autosave";

export function SaveStatus({ state, lastSavedAt, today }: { state: SaveState; lastSavedAt: string | null; today: string }) {
  let text = "Changes save automatically.";
  let tone = "text-muted";
  let icon = <CheckCircle2 className="h-4 w-4" aria-hidden="true" />;

  if (state.kind === "saving") {
    text = "Saving…";
    icon = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  } else if (state.kind === "saved") {
    text = `Saved ${savedAtLabel(state.at, today)}`;
    tone = "text-ok";
  } else if (state.kind === "retrying") {
    text = state.message ?? "Couldn't save, retrying. Keep this tab open.";
    tone = "text-warn";
    icon = <WifiOff className="h-4 w-4" aria-hidden="true" />;
  } else if (state.kind === "signed_out") {
    text = "Signed out. Sign in to save.";
    tone = "text-bad";
    icon = <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
  } else if (state.kind === "stale" || state.kind === "locked") {
    text = "Not saved. This page is out of date.";
    tone = "text-bad";
    icon = <AlertTriangle className="h-4 w-4" aria-hidden="true" />;
  } else if (lastSavedAt) {
    text = `Saved ${savedAtLabel(lastSavedAt, today)}`;
  }

  return (
    <p role="status" aria-live="polite" data-save-state={state.kind} className={cn("inline-flex items-center gap-2 text-sm font-semibold", tone)}>
      {icon}
      <span>{text}</span>
      {state.kind === "signed_out" ? (
        <a href="/login" target="_blank" rel="noreferrer" className="text-harbor-800 underline underline-offset-2">
          Sign in (opens a new tab)
        </a>
      ) : null}
    </p>
  );
}
