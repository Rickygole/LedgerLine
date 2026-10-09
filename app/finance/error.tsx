"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel digest={error.digest} reset={reset} />;
}
