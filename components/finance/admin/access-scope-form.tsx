"use client";

import { useActionState, useRef, useState } from "react";
import { X } from "lucide-react";
import { findInitiatives, setAccessScope } from "@/app/finance/users/actions";
import { Button } from "@/components/ui/button";
import { Hint, Input, Label } from "@/components/ui/field";

type Picked = { id: string; label: string };

export function AccessScopeForm({
  userId,
  name,
  agencies,
  chosenAgencies,
  chosenInitiatives,
}: {
  userId: string;
  name: string;
  agencies: string[];
  chosenAgencies: string[];
  chosenInitiatives: Picked[];
}) {
  const [state, action, pending] = useActionState(setAccessScope, undefined);
  const [picked, setPicked] = useState<Picked[]>(chosenInitiatives);
  const [matches, setMatches] = useState<Picked[]>([]);
  const [searched, setSearched] = useState(false);
  const latest = useRef(0);

  async function search(value: string) {
    const ticket = ++latest.current;
    const found = value.trim().length < 2 ? [] : await findInitiatives(value);
    if (ticket !== latest.current) return;
    setMatches(found.filter((m) => !picked.some((p) => p.id === m.id)));
    setSearched(value.trim().length >= 2);
  }

  return (
    <form action={action} className="space-y-3 border-t border-line pt-5">
      <input type="hidden" name="userId" value={userId} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-ink">Access scope</legend>
        <Hint>
          Leave everything unchecked to give {name} access to every agency. Choose agencies or initiatives to limit what
          they can see and review.
        </Hint>
        <ul className="grid grid-cols-3 gap-x-3 gap-y-1.5">
          {agencies.map((agency) => (
            <li key={agency}>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="agency"
                  value={agency}
                  defaultChecked={chosenAgencies.includes(agency)}
                  className="h-4 w-4 rounded border-line"
                />
                {agency}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div>
        <Label htmlFor={`scope-find-${userId}`} optional>
          Add an initiative
        </Label>
        <Input
          id={`scope-find-${userId}`}
          type="search"
          autoComplete="off"
          placeholder="Search by name or code"
          onChange={(event) => void search(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
        {matches.length > 0 ? (
          <ul aria-label="Matching initiatives" className="mt-1 divide-y divide-line-soft rounded border border-line">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm text-link hover:bg-surface hover:text-link-hover"
                  onClick={() => {
                    setPicked((current) => [...current, m]);
                    setMatches((current) => current.filter((c) => c.id !== m.id));
                  }}
                >
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        ) : searched ? (
          <p className="mt-1 text-sm text-muted">No initiatives match.</p>
        ) : null}
      </div>
      {picked.length > 0 ? (
        <ul aria-label="Chosen initiatives" className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-1 rounded-sm border border-line bg-surface py-0.5 pl-2 pr-1 text-sm text-ink"
            >
              <input type="hidden" name="initiative" value={p.id} />
              {p.label}
              <button
                type="button"
                aria-label={`Remove ${p.label}`}
                className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-ink"
                onClick={() => setPicked((current) => current.filter((c) => c.id !== p.id))}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving" : "Save access scope"}
      </Button>
      {state ? (
        <p
          role={state.error ? "alert" : "status"}
          className={`text-sm font-semibold ${state.error ? "text-bad" : "text-ok"}`}
        >
          {state.error ?? state.ok}
        </p>
      ) : null}
    </form>
  );
}
