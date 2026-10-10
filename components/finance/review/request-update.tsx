"use client";

import { useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { draftNoteAction, sendUpdateAction } from "@/app/finance/submissions/[id]/actions";
import { Badge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/field";
import type { Concern } from "@/lib/finance/review/return-note-core";
import { StaleNotice, isStale } from "./stale-notice";
import { formatTime, nowIso } from "@/lib/dates";

type Draft = { text: string; mode: "live" | "fallback"; aiActionId: string | null; ruleIds: string[]; dropped: number };


export function RequestUpdate({
  submissionId,
  lockVersion,
  concerns,
  contactName,
  prefill,
  variant = "secondary",
  onDone,
}: {
  submissionId: string;
  lockVersion: number;
  concerns: Concern[];
  contactName: string | null;
  prefill: string;
  variant?: "secondary" | "ghost";
  onDone: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [usedDraft, setUsedDraft] = useState<string | null>(null);
  const [text, setText] = useState(prefill);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]));

  const makeDraft = () => {
    setError(null);
    startTransition(async () => {
      const res = await draftNoteAction(submissionId, selected);
      if (!res.ok) return setError(res.message);
      setDraft(res);
    });
  };

  const take = () => {
    if (!draft) return;
    setText(draft.text);
    setUsedDraft(draft.aiActionId);
    setDraft(null);
    requestAnimationFrame(() => noteRef.current?.focus());
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
      if (res.error) return setError(res.error);
      setSent(true);
      dialog.current?.close();
      onDone(`Update requested at ${formatTime(nowIso())}. ${contactName ?? "The organization's primary contact"} will see the note in Messages and above their report.`);
      requestAnimationFrame(() => document.getElementById("queue-next")?.focus());
    });
  };

  if (sent) return null;

  const live = draft?.mode === "live";
  const title = `Request an update${contactName ? ` from ${contactName}` : ""}`;

  return (
    <>
      <Button variant={variant} className={variant === "secondary" ? "h-11 w-full text-base" : "px-0"} onClick={() => dialog.current?.showModal()}>
        Request an update
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="request-title"
        className="m-auto w-[min(40rem,calc(100vw-2rem))] max-w-none rounded border border-line bg-white p-0 text-ink shadow-[0_4px_16px_rgba(10,26,48,0.16)] backdrop:bg-[#0a1a30]/50"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 pb-4 pt-5">
          <h2 id="request-title" className="text-xl font-bold leading-7">
            {title}
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink hover:bg-surface" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[70dvh] space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label htmlFor="return-note" className="block text-base font-semibold">
              Note to the organization
            </label>
            <p id="return-note-hint" className="mb-1.5 text-sm text-muted">
              They see this note above their report.
            </p>
            <Textarea
              ref={noteRef}
              id="return-note"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={6}
              className="text-base sm:text-[15px]"
              aria-describedby={["return-note-hint", error ? "return-note-error" : null].filter(Boolean).join(" ")}
              aria-invalid={error && !isStale(error) ? true : undefined}
            />
            {usedDraft ? <p className="mt-1 text-sm text-muted">Started from a suggested note. Your name is recorded as the sender.</p> : null}
            {error && isStale(error) ? <StaleNotice /> : <FieldError id="return-note-error">{error}</FieldError>}
          </div>

          {prefill !== "" && concerns.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer list-none text-sm font-semibold text-link underline underline-offset-2 [&::-webkit-details-marker]:hidden">Suggest a different note</summary>
              <div className="mt-3 space-y-3">
                <fieldset>
                  <legend className="text-sm font-semibold">What needs to change</legend>
                  <ul className="mt-1.5 space-y-1">
                    {concerns.map((concern) => (
                      <li key={concern.id}>
                        <label htmlFor={`concern-${concern.id}`} className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-[15px] hover:bg-harbor-50">
                          <input id={`concern-${concern.id}`} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-harbor-800" checked={selected.includes(concern.id)} onChange={() => toggle(concern.id)} disabled={pending} />
                          <span className="min-w-0">
                            {concern.label}
                            {concern.detail ? <span className="block text-sm text-muted">{concern.detail}</span> : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
                <Button size="sm" variant="secondary" onClick={makeDraft} disabled={pending || selected.length === 0}>
                  {pending && !draft ? "Suggesting" : draft ? "Suggest again" : "Suggest a note"}
                </Button>
                {draft ? (
                  <section aria-label="Suggested note" className="rounded border border-line bg-harbor-50 p-3">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">
                        Suggested
                      </Badge>
                      <span className="text-[13px] text-muted">{live ? "Written by a language model from the checks you chose." : "Built from the report rules. No model was used."}</span>
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6">{draft.text}</p>
                    <div className="mt-3 flex flex-wrap gap-4">
                      <Button size="sm" variant="secondary" onClick={take}>
                        Use this note
                      </Button>
                      <Button size="sm" variant="ghost" className="px-0" onClick={() => setDraft(null)}>
                        Discard
                      </Button>
                    </div>
                  </section>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-line-soft px-6 py-4">
          <Button onClick={send} disabled={pending} className="h-11 px-5 text-base">
            {pending && text ? "Sending" : "Send request"}
          </Button>
          <Button variant="ghost" className="px-0" onClick={() => dialog.current?.close()} disabled={pending}>
            Cancel
          </Button>
        </div>
      </dialog>
    </>
  );
}
