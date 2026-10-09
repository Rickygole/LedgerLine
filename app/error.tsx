"use client";

import { ErrorPanel } from "@/components/shell/error-panel";
import { PlainFrame } from "@/components/shell/plain-frame";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PlainFrame>
      <ErrorPanel digest={error.digest} reset={reset} />
    </PlainFrame>
  );
}
