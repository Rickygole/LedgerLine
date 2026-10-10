"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      tone="bad"
      title="This page did not load"
      actions={
        <>
          <ButtonLink href={home} variant="secondary">
            {homeLabel}
          </ButtonLink>
          <Button onClick={reset}>Try again</Button>
        </>
      }
      footnote={
        digest ? (
          <>
            If it keeps happening, contact your LedgerLine administrator and quote reference{" "}
            <span className="font-mono text-ink">{digest}</span>. See <HelpLink /> for support hours.
          </>
        ) : (
          <>
            If it keeps happening, contact your LedgerLine administrator. See <HelpLink /> for support hours.
          </>
        )
      }
    >
      <p>
        {portal
          ? "Anything you saved before this happened is safe. Try again, or go back and open the report from My reports."
          : "Nothing was changed. Try again, or go back and pick up from the dashboard."}
      </p>
    </StatusPanel>
  );
}

function HelpLink() {
  return (
    <Link href="/help" className="text-link underline underline-offset-2 hover:text-link-hover">
      Help and contact
    </Link>
  );
}
