"use client";

import { useState, useTransition } from "react";
import { Send, Sparkles } from "lucide-react";
import { draftNoteAction, sendUpdateAction, type ActionResult } from "@/app/finance/submissions/[id]/actions";
import { Badge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Label, Textarea } from "@/components/ui/field";
import type { Concern } from "@/lib/finance/review/return-note-core";

type Draft = { text: string; mode: "live" | "fallback"; aiActionId: string | null; ruleIds: string[]; dropped: number };

export function RequestUpdate({ submissionId, lockVersion, concerns }: { submissionId: string; lockVersion: number; concerns: Concern[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

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
      setText(res.text);
    });
  };

  const send = () => {
    setError(null);
    startTransition(async () => {
      const res = await sendUpdateAction({ submissionId, lockVersion, text, aiActionId: draft?.aiActionId ?? null });
      if (!res.ok) setError(res.message);
      else setResult(res);
    });
  };

  if (result) {
    return (
      <p role="status" className="rounded-md border border-ok/30 bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">
        {result.message}
      </p>
    );
  }

  if (!open) {
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        Request update
      </Button>
    );
  }

  const aiOff = draft !== null && draft.aiActionId === null;
  const modeText = draft ? (draft.mode === "live" ? "Drafted by the AI model" : aiOff ? "Written from the template. The AI switch is off" : "Drafted offline by rule template") : "";

  return (
    <div className="space-y-3 rounded-md border border-line bg-surface/60 p-3">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">What needs to change</legend>
        <Hint>Choose the concerns to send. The organization sees plain sentences only.</Hint>
        <ul className="space-y-2">
          {concerns.map((concern) => (
            <li key={concern.id} className="flex items-start gap-2">
              <input
                id={`concern-${concern.id}`}
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-line"
                checked={selected.includes(concern.id)}
                onChange={() => toggle(concern.id)}
                disabled={pending}
              />
              <label htmlFor={`concern-${concern.id}`} className="text-sm text-ink">
                {concern.label}
                {concern.detail ? <span className="block text-xs text-muted">{concern.detail}</span> : null}
                <span className="num ml-0 mt-0.5 inline-block rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-muted ring-1 ring-inset ring-line">{concern.ruleId}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <Button size="sm" variant="secondary" onClick={makeDraft} disabled={pending || selected.length === 0}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {pending && !draft ? "Drafting" : draft ? "Draft again" : "Draft the note"}
      </Button>

      {draft ? (
        <div>
          <Label htmlFor="return-note">{aiOff ? "Drafted from template, needs your review" : "AI draft, needs your review"}</Label>
          <p className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={draft.mode === "live" ? "info" : "neutral"}>{modeText}</Badge>
            <span>Rules cited, visible to you only:</span>
            {draft.ruleIds.map((id) => (
              <span key={id} className="num rounded bg-white px-1.5 py-0.5 font-semibold ring-1 ring-inset ring-line">
                {id}
              </span>
            ))}
          </p>
          <Textarea id="return-note" value={text} onChange={(event) => setText(event.target.value)} rows={7} aria-describedby={error ? "return-note-error" : undefined} aria-invalid={error ? true : undefined} />
          <FieldError id="return-note-error">{error}</FieldError>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={send} disabled={pending || text.trim() === ""}>
              <Send className="h-4 w-4" aria-hidden="true" />
              {pending ? "Sending" : "Send to organization"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <FieldError>{error}</FieldError>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
