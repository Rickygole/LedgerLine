"use client";

import "./globals.css";
import { ErrorPanel } from "@/components/shell/error-panel";
import { PlainFrame } from "@/components/shell/plain-frame";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <title>Something went wrong | LedgerLine</title>
        <PlainFrame>
          <ErrorPanel digest={error.digest} reset={reset} />
        </PlainFrame>
      </body>
    </html>
  );
}
