import { FlaskConical } from "lucide-react";

export function SyntheticBanner() {
  return (
    <div role="note" className="no-print bg-warn-bg text-warn">
      <div className="mx-auto flex max-w-[1440px] items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold sm:px-6">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
        <span>SYNTHETIC DEMO DATA. Not NYC Council records.</span>
      </div>
    </div>
  );
}

export function CreditFooter() {
  return (
    <footer className="no-print mt-16 border-t border-line bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-muted sm:px-6">
        <span>Prepared for Estrada Consulting by Ricky Gole. Proof of concept. Synthetic data. Not an official NYC system.</span>
        <span className="flex gap-4">
          <a href="/trust" className="hover:text-navy-800 hover:underline">Requirements evidence</a>
          <a href="/about" className="hover:text-navy-800 hover:underline">About this proof of concept</a>
        </span>
      </div>
    </footer>
  );
}
