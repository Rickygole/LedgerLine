"use client";

import { Check, ChevronDown } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/cn";

export type StepState = "complete" | "error" | "todo";
export type Step = { key: string; title: string; state: StepState; errors: number; optional?: boolean };

function stepHref(key: string) {
  return `?step=${encodeURIComponent(key)}`;
}

function Marker({ step, index, current }: { step: Step; index: number; current: boolean }) {
  if (current) {
    return <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action text-[13px] font-bold text-white">{index + 1}</span>;
  }
  if (step.state === "error") {
    return <span className="num flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-bad px-1.5 text-[13px] font-bold text-white">{step.errors}</span>;
  }
  if (step.state === "complete") {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok text-white">
        <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  return <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-white text-[13px] font-bold text-muted">{index + 1}</span>;
}

function stateText(step: Step) {
  if (step.state === "complete") return "complete";
  if (step.state === "error") return `${step.errors} ${step.errors === 1 ? "problem" : "problems"}`;
  return step.optional ? "optional" : "not complete";
}

function StepList({ steps, current, onSelect }: { steps: Step[]; current: string; onSelect: (key: string) => void }) {
  return (
    <ol className="flex flex-col gap-0.5">
      {steps.map((step, index) => {
        const active = step.key === current;
        return (
          <li key={step.key}>
            <a
              href={stepHref(step.key)}
              aria-current={active ? "step" : undefined}
              aria-label={`Step ${index + 1}: ${step.title}, ${stateText(step)}`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onSelect(step.key);
              }}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded px-3 py-2 text-[15px] leading-5 no-underline",
                active ? "bg-harbor-50 font-bold text-ink" : step.state === "error" ? "font-semibold text-bad hover:bg-harbor-50" : "text-ink hover:bg-harbor-50"
              )}
            >
              <span aria-hidden="true" className="contents">
                <Marker step={step} index={index} current={active} />
              </span>
              <span className="min-w-0">{step.title}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export function Stepper({ steps, current, onSelect }: { steps: Step[]; current: string; onSelect: (key: string) => void }) {
  const drawer = useRef<HTMLDetailsElement>(null);
  const done = steps.filter((step) => step.state === "complete").length;
  const index = Math.max(0, steps.findIndex((step) => step.key === current));
  const percent = Math.round((done / steps.length) * 100);
  const progress = (
    <>
      <p className="num text-sm font-semibold text-ink-2">
        {done} of {steps.length} sections complete
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-harbor-100" aria-hidden="true">
        <div className="h-full w-full origin-left bg-ok" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
    </>
  );
  return (
    <nav aria-label="Report sections" className="no-print">
      <details ref={drawer} className="group rounded border border-line bg-white lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="num block text-sm font-semibold text-muted">
              Step {index + 1} of {steps.length}
            </span>
            <span className="block truncate text-base font-bold text-ink">{steps[index]?.title}</span>
            <span className="mt-2 block h-1.5 w-40 overflow-hidden rounded-sm bg-harbor-100 group-open:hidden" aria-hidden="true">
              <span className="block h-full w-full origin-left bg-ok" style={{ transform: `scaleX(${percent / 100})` }} />
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-link">
            All sections
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </span>
        </summary>
        <div className="border-t border-line-soft px-2 pb-2 pt-3">
          <div className="px-2 pb-3">{progress}</div>
          <StepList
            steps={steps}
            current={current}
            onSelect={(key) => {
              if (drawer.current) drawer.current.open = false;
              onSelect(key);
            }}
          />
        </div>
      </details>
      <div className="hidden lg:block">
        <div className="mb-4 px-3">{progress}</div>
        <StepList steps={steps} current={current} onSelect={onSelect} />
      </div>
    </nav>
  );
}
