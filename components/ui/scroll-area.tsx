"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="relative min-w-0 last:overflow-hidden last:rounded-b">
      <div ref={ref} className={cn("relative overflow-x-auto overscroll-x-contain", className)}>
        {children}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-[11] w-8 bg-gradient-to-l from-[rgb(16_24_40/0.09)] to-transparent",
          more ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
