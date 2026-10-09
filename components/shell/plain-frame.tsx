import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function PlainFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 focus:outline-none sm:px-6">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
