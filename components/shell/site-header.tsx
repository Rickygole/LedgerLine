import Link from "next/link";
import { Logo } from "./logo";

export function SiteHeader() {
  return (
    <header className="no-print bg-navy-900 text-white">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center px-4 sm:px-6">
        <Link href="/" className="rounded-sm" aria-label="LedgerLine home">
          <Logo subtitle="Council-funded program reporting" />
        </Link>
      </div>
    </header>
  );
}
