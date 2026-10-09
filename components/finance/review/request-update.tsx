"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Pencil, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { draftNoteAction, sendUpdateAction, type ActionResult } from "@/app/finance/submissions/[id]/actions";
import { AiDraftBadge, Badge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/field";
import type { Concern } from "@/lib/finance/review/return-note-core";
import { StaleNotice, isStale } from "./stale-notice";

type Draft = { text: string; mode: "live" | "fallback"; aiActionId: string | null; ruleIds: string[]; dropped: number };

export function RequestUpdate({ submissionId, lockVersion, concerns, onDone }: { submissionId: string; lockVersion: number; concerns: Concern[]; onDone: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [usedDraft, setUsedDraft] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));

  const makeDraft = () => {
    setError(null);
    startTransition(async () => {
      const res = await draftNoteAction(submissionId, selected);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDraft(res);
    });
  };

  const take = (focus: boolean) => {
    if (!draft) return;
    setText(draft.text);
    setUsedDraft(draft.aiActionId);
    setDraft(null);
    if (focus) requestAnimationFrame(() => noteRef.current?.focus());
  };

  const send = () => {
    setError(null);
    if (text.trim() === "") {
      setError("Write a note before sending. The organization needs to know what to change.");
      noteRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const res = await sendUpdateAction({ submissionId, lockVersion, text, aiActionId: usedDraft });
      if (!res.ok) setError(res.message);
      else {
        setResult(res);
        onDone(res.message);
      }
    });
  };

  if (result) return null;

  if (!open) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Request update
      </Button>
    );
  }

  const aiOff = draft !== null && draft.aiActionId === null;
  const template = draft !== null && draft.mode !== "live";
  const source = draft ? (draft.mode === "live" ? "Live model" : aiOff ? "The AI switch is off, so this follows the report rules" : "Built from the report rules. No model was used") : "";

  return (
    <div className="space-y-4 rounded-lg border border-line bg-surface/60 p-3">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">What needs to change</legend>
        <p className="mb-2 mt-0.5 text-[13px] text-muted">Pick the problems to raise. They help draft the note.</p>
        <ul className="space-y-1.5">
          {concerns.map((concern) => (
            <li key={concern.id}>
              <label htmlFor={`concern-${concern.id}`} className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm text-ink hover:bg-white">
                <input id={`concern-${concern.id}`} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-line accent-navy-800" checked={selected.includes(concern.id)} onChange={() => toggle(concern.id)} disabled={pending} />
                <span className="min-w-0">
                  {concern.label}
                  <span className="ml-1.5 font-mono text-[11px] text-muted">{concern.ruleId}</span>
                  {concern.detail ? <span className="block text-xs text-muted">{concern.detail}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <Button size="sm" variant="secondary" onClick={makeDraft} disabled={pending || selected.length === 0}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {pending && !text ? "Drafting" : draft ? "Draft again" : "Draft a note"}
      </Button>

      {draft ? (
        <section aria-label="Suggested note" className="rounded-lg border border-dashed border-[#c9b8ef] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            {template ? <Badge>Drafted from the rules</Badge> : <AiDraftBadge />}
            <span className="text-xs text-muted">{source}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink">{draft.text}</p>
          {draft.ruleIds.length > 0 ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span>Rules cited, not shown to the organization:</span>
              {draft.ruleIds.map((id) => (
                <span key={id} className="font-mono rounded bg-surface px-1.5 py-0.5 ring-1 ring-inset ring-line">
                  {id}
                </span>
              ))}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => take(false)}>
              <Check className="h-4 w-4" aria-hidden="true" />
              Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => take(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              <X className="h-4 w-4" aria-hidden="true" />
              Discard
            </Button>
          </div>
        </section>
      ) : null}

      <div>
        <Label htmlFor="return-note" required>
          Note to the organization
        </Label>
        <p id="return-note-hint" className="mb-1.5 text-[13px] text-muted">
          Tell the organization exactly what to change.
        </p>
        <Textarea
          ref={noteRef}
          id="return-note"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          className="bg-white"
          aria-describedby={["return-note-hint", error ? "return-note-error" : null].filter(Boolean).join(" ")}
          aria-invalid={error && !isStale(error) ? true : undefined}
        />
        {usedDraft ? <p className="mt-1 text-xs text-muted">{template ? "Started from a draft built from the rules." : "Started from the AI draft."} Your name is recorded as the sender.</p> : null}
        {error && isStale(error) ? <StaleNotice /> : <FieldError id="return-note-error">{error}</FieldError>}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={send} disabled={pending}>
          <Send className="h-4 w-4" aria-hidden="true" />
          {pending && text ? "Sending" : "Send to organization"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
