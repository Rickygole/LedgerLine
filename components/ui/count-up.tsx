"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const noop = () => () => {};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CountUp({ value, duration = 600 }: { value: number; duration?: number }) {
  const isClient = useSyncExternalStore(noop, () => true, () => false);
  const [shown, setShown] = useState(() => (isClient && !prefersReducedMotion() ? 0 : value));
  const from = useRef(shown);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    if (prefersReducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(start + (value - start) * eased);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <>
      <span aria-hidden="true">{shown.toLocaleString("en-US")}</span>
      <span className="sr-only">{value.toLocaleString("en-US")}</span>
    </>
  );
}
