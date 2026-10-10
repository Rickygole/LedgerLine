import Link from "next/link";
import { Logo } from "./logo";

export function BrandBar({
  children,
  home = "/",
  homeLabel = "LedgerLine home",
  before,
}: {
  children?: React.ReactNode;
  home?: string;
  homeLabel?: string;
  before?: React.ReactNode;
}) {
  return (
    <div className="flex h-[72px] items-center justify-between gap-4 border-b-4 border-harbor-600 bg-harbor-900 px-4 text-white sm:px-8">
      <div className="flex min-w-0 items-center gap-2">
        {before}
        <Link href={home} className="min-w-0 rounded-sm" aria-label={homeLabel}>
          <Logo />
        </Link>
      </div>
      {children}
    </div>
  );
}

export function SiteHeader({ signIn = true }: { signIn?: boolean }) {
  return (
    <header className="no-print">
      <BrandBar>
        {signIn ? (
          <Link
            href="/login"
            className="shrink-0 rounded-sm font-semibold text-white underline underline-offset-4 hover:decoration-2"
          >
            Sign in
          </Link>
        ) : null}
      </BrandBar>
    </header>
  );
}
