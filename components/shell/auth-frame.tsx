import { ClipboardCheck, History, Table2 } from "lucide-react";
import { Logo } from "./logo";
import { CreditFooter, SyntheticBanner } from "./synthetic-banner";

const POINTS = [
  { icon: ClipboardCheck, title: "Configurable forms", text: "Reporting forms that change each fiscal year without a rebuild." },
  { icon: Table2, title: "Budgets that balance", text: "Spreadsheet-style budgets must reconcile to the award before submission." },
  { icon: History, title: "Complete audit trail", text: "Review, request updates, and keep a permanent record for every report." },
];

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SyntheticBanner />
      <div className="grid flex-1 lg:min-h-[calc(100dvh-28px-57px)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section aria-label="About LedgerLine" className="on-dark relative hidden overflow-hidden bg-navy-950 text-white lg:flex lg:flex-col lg:justify-between lg:gap-12 lg:p-12 xl:p-16">
          <div aria-hidden="true" className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_75%)]" />
          <div aria-hidden="true" className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-navy-600/25 blur-3xl" />
          <div className="relative">
            <Logo subtitle="Initiative Reporting System" />
          </div>
          <div className="relative max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-navy-300">Every Council-funded initiative, line by line.</p>
            <p className="mt-4 text-4xl font-bold leading-[1.15] tracking-tight xl:text-[42px]">One place for funded organizations to report and for Finance to review.</p>
            <ul className="mt-10 grid gap-5">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] ring-1 ring-white/15" aria-hidden="true">
                    <Icon className="h-4 w-4 text-navy-200" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{title}</span>
                    <span className="mt-0.5 block text-sm text-navy-200">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-xs text-navy-300">Synthetic demonstration data throughout.</p>
        </section>
        <main id="main" tabIndex={-1} className="flex min-w-0 items-center justify-center bg-surface px-4 py-10 focus:outline-none sm:px-8 lg:bg-white lg:py-16">
          <div className="w-full max-w-md">
            <div className="mb-8 lg:hidden">
              <Logo tone="light" subtitle="Initiative Reporting System" />
            </div>
            {children}
          </div>
        </main>
      </div>
      <CreditFooter className="mt-0" />
    </div>
  );
}
