"use client";

import { useEffect, useRef } from "react";

export function ErrorSummary({
  errors,
  heading = "Fix the following before continuing",
}: {
  errors: { id: string; message: string }[];
  heading?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const signature = errors.map((e) => e.message).join("|");
  useEffect(() => {
    if (signature) ref.current?.focus();
  }, [signature]);
  if (errors.length === 0) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="mb-5 rounded-md border border-bad/30 bg-bad-bg px-4 py-3 text-sm text-bad focus:outline-none focus:ring-2 focus:ring-bad/40"
    >
      <p className="font-semibold">{heading}</p>
      <ul className="mt-1 list-disc pl-5">
        {errors.map((e) => (
          <li key={e.id}>
            {e.id ? (
              <a href={`#${e.id}`} className="underline">
                {e.message}
              </a>
            ) : (
              e.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
