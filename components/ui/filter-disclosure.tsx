"use client";

import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

export function FilterDisclosure({
  applied = 0,
  layout,
  className,
  children,
}: {
  applied?: number;
  layout: "grid" | "flex";
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="w-full lg:hidden">
        <Button variant="secondary" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {open ? "Hide filters" : "Filters"}
          {applied > 0 ? <span className="font-normal">({applied} applied)</span> : null}
        </Button>
      </div>
      <div
        id={id}
        className={cn(open ? (layout === "grid" ? "grid" : "flex flex-col") : "hidden", "gap-3 lg:contents", className)}
      >
        {children}
      </div>
    </>
  );
}
