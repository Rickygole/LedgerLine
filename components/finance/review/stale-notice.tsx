"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function isStale(message: string | null | undefined) {
  return Boolean(message?.startsWith("Someone else changed this report"));
}

export function StaleNotice() {
  return (
    <div role="alert" className="mt-2 rounded-md border border-l-4 border-line border-l-warn bg-white px-3 py-2.5 text-sm">
      <p className="font-semibold text-ink">Someone else changed this report. Reload to see their changes.</p>
      <Button size="sm" variant="secondary" className="mt-2" onClick={() => window.location.reload()}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Reload
      </Button>
    </div>
  );
}
