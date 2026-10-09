import Link from "next/link";
import { Logo } from "./logo";
import { SiteFooter } from "./site-footer";

export function PlainFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <header className="on-dark bg-navy-900 text-white">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-4 sm:px-6">
          <Link href="/" className="rounded-md" aria-label="LedgerLine home">
            <Logo subtitle="Council-funded program reporting" />
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 focus:outline-none sm:px-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
