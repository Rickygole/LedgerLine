import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/cn";
import { LogoMark } from "./logo";

export function SyntheticBanner() {
  return (
    <div role="note" aria-label="Data notice" className="no-print border-b border-warn/20 bg-warn-bg text-warn">
      <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-semibold tracking-wide sm:px-6">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>SYNTHETIC DEMO DATA. Not NYC Council records.</span>
      </div>
    </div>
  );
}

export function CreditFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("no-print mt-16 border-t border-line bg-white", className)}>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="flex items-start gap-2.5">
          <LogoMark className="mt-px h-4 w-4 shrink-0 opacity-70" />
          <span>Prepared for Estrada Consulting by Ricky Gole. Proof of concept. Synthetic data. Not an official NYC system.</span>
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
          <a href="/trust" className="font-medium hover:text-navy-800 hover:underline">Requirements evidence</a>
          <a href="/about" className="font-medium hover:text-navy-800 hover:underline">About this proof of concept</a>
        </nav>
      </div>
    </footer>
  );
}
