"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveDraft } from "@/app/portal/reports/actions";
import { newRowId } from "./budget-rows";
import type { SaveInput, SaveResult } from "./types";

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "retrying"; message?: string }
  | { kind: "signed_out" }
  | { kind: "stale"; by: string | null; at: string }
  | { kind: "locked"; message: string };

export type DrainOutcome = "saved" | "idle" | "retrying" | "signed_out" | "stale" | "locked";

const DEBOUNCE_MS = 1200;

async function sessionAlive(): Promise<boolean> {
  try {
    const response = await fetch("/api/upload/session", { cache: "no-store" });
    return response.ok;
  } catch {
    return true;
  }
}

export function useAutosave(initialLock: number, build: () => Omit<SaveInput, "expectedLock" | "submissionId" | "saveId">, submissionId: string) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const lockRef = useRef(initialLock);
  const dirty = useRef(false);
  const halted = useRef(false);
  const haltReason = useRef<"stale" | "locked" | null>(null);
  const inflight = useRef<Promise<DrainOutcome> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const saveId = useRef(newRowId());
  const buildRef = useRef(build);

  useEffect(() => {
    buildRef.current = build;
  });

  const drain = useCallback((): Promise<DrainOutcome> => {
    if (inflight.current) return inflight.current;
    const run = (async (): Promise<DrainOutcome> => {
      let outcome: DrainOutcome = "idle";
      while (dirty.current && !halted.current) {
        dirty.current = false;
        setState({ kind: "saving" });
        let result: SaveResult;
        try {
          result = await saveDraft({ submissionId, expectedLock: lockRef.current, saveId: saveId.current, ...buildRef.current() });
        } catch {
          result = (await sessionAlive()) ? { status: "error", message: "network" } : { status: "signed_out" };
        }
        if (result.status === "saved") {
          lockRef.current = result.lockVersion;
          saveId.current = newRowId();
          attempts.current = 0;
          outcome = "saved";
          setState({ kind: "saved", at: result.savedAt });
          continue;
        }
        if (result.status === "stale") {
          halted.current = true;
          haltReason.current = "stale";
          setState({ kind: "stale", by: result.by, at: result.at });
          return "stale";
        }
        if (result.status === "locked") {
          halted.current = true;
          haltReason.current = "locked";
          setState({ kind: "locked", message: result.message });
          return "locked";
        }
        dirty.current = true;
        attempts.current += 1;
        const delay = result.status === "signed_out" ? 8000 : Math.min(4000 * attempts.current, 30000);
        if (retry.current) clearTimeout(retry.current);
        retry.current = setTimeout(() => void drain(), delay);
        setState(result.status === "signed_out" ? { kind: "signed_out" } : { kind: "retrying", message: result.status === "error" && result.message !== "network" ? result.message : undefined });
        return result.status === "signed_out" ? "signed_out" : "retrying";
      }
      return outcome;
    })();
    inflight.current = run;
    void run.finally(() => {
      if (inflight.current === run) inflight.current = null;
    });
    return run;
  }, [submissionId]);

  const markDirty = useCallback(() => {
    if (halted.current) return;
    dirty.current = true;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void drain(), DEBOUNCE_MS);
  }, [drain]);

  const flushNow = useCallback(async (): Promise<DrainOutcome> => {
    if (debounce.current) clearTimeout(debounce.current);
    if (retry.current) clearTimeout(retry.current);
    if (inflight.current) await inflight.current;
    if (haltReason.current) return haltReason.current;
    return drain();
  }, [drain]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || inflight.current) event.preventDefault();
    };
    const onFocus = () => {
      if (dirty.current && !inflight.current) void drain();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("focus", onFocus);
      if (debounce.current) clearTimeout(debounce.current);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [drain]);

  return { state, markDirty, flushNow, lockRef, isHalted: () => halted.current };
}
