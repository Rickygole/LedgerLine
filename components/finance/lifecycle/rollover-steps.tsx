import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

const STEPS = ["Choose source year", "Review initiatives", "Review forms", "Confirm"];

export function RolloverSteps({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <ol
      aria-label="Rollover steps"
      className="mb-6 grid grid-cols-4 gap-2 rounded-xl border border-line bg-white px-4 py-3 shadow-card sm:px-5"
    >
      {STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className="flex min-w-0 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-2.5"
          >
            <span
              className={cn(
                "num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                active
                  ? "bg-navy-800 text-white"
                  : done
                    ? "bg-ok text-white"
                    : "border border-line-strong bg-white text-muted",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : number}
            </span>
            <span
              className={cn(
                "text-xs leading-4 sm:shrink-0 sm:text-sm",
                active ? "font-semibold text-ink" : done ? "text-ink" : "text-muted",
              )}
            >
              {label}
              {done ? <span className="sr-only"> (complete)</span> : null}
            </span>
            {index < STEPS.length - 1 ? (
              <span
                className={cn("hidden h-0.5 min-w-4 flex-1 rounded-full sm:block", done ? "bg-ok" : "bg-line")}
                aria-hidden="true"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
