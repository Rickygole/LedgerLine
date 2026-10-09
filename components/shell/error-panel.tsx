"use client";

import { usePathname } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusPanel } from "./status-page";

export function ErrorPanel({ digest, reset }: { digest?: string; reset: () => void }) {
  const pathname = usePathname() ?? "/";
  const portal = pathname.startsWith("/portal");
  const finance = pathname.startsWith("/finance");
  const home = portal ? "/portal" : finance ? "/finance" : "/";
  const homeLabel = portal ? "Back to My reports" : finance ? "Back to dashboard" : "Go to the home page";
  return (
    <StatusPanel
      icon={AlertTriangle}
      tone="bad"
      eyebrow="Something went wrong"
      title="This page did not load"
      actions={
        <>
          <ButtonLink href={home} variant="secondary">
            {homeLabel}
          </ButtonLink>
          <Button onClick={reset}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        </>
      }
      footnote={
        digest ? (
          <>
            If it keeps happening, contact your LedgerLine administrator and quote reference <span className="font-mono text-ink">{digest}</span>.
          </>
        ) : (
          "If it keeps happening, contact your LedgerLine administrator."
        )
      }
    >
      <p>{portal ? "Anything you saved before this happened is safe. Try again, or go back and open the report from My reports." : "Nothing was changed. Try again, or go back and pick up from the dashboard."}</p>
    </StatusPanel>
  );
}
