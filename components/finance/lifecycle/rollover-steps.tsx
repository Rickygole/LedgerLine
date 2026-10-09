import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = ["Choose years", "Plan each initiative", "Review and run", "Result"];

export function RolloverSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol aria-label="Rollover steps" className="mb-6 flex flex-wrap gap-2">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
              active ? "border-navy-800 bg-navy-800 font-semibold text-white" : done ? "border-ok/30 bg-ok-bg text-ok" : "border-line bg-white text-muted"
            )}
          >
            <span className={cn("num flex h-5 w-5 items-center justify-center rounded-full text-xs", active ? "bg-white text-navy-900" : "bg-surface text-muted")}>
              {done ? <Check className="h-3 w-3" aria-hidden="true" /> : number}
            </span>
            {label}
            {done ? <span className="sr-only">(complete)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
