import { ShieldCheck } from "lucide-react";
import { Logo } from "./logo";
import { CreditFooter, SyntheticBanner } from "./synthetic-banner";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SyntheticBanner />
      <div className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
        <section className="relative hidden overflow-hidden bg-navy-900 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div aria-hidden="true" className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative">
            <Logo subtitle="Initiative Reporting System" />
          </div>
          <div className="relative max-w-lg">
            <p className="text-sm font-semibold uppercase tracking-widest text-navy-100/70">Every Council-funded initiative, line by line.</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight">One place for funded organizations to report and for Finance to review.</h1>
            <ul className="mt-8 space-y-3 text-sm text-navy-100/90">
              {[
                "Configurable reporting forms that change each fiscal year without a rebuild",
                "Spreadsheet-style budgets that must balance to the award before submission",
                "Review, request updates, and a complete audit trail for every report",
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-100/70" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-navy-100/60">Proof of concept prepared for Estrada Consulting by Ricky Gole. Not an official NYC system.</p>
        </section>
        <section className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="w-full max-w-md">{children}</div>
        </section>
      </div>
      <CreditFooter />
    </div>
  );
}
