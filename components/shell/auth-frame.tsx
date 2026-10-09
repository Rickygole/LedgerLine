import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 px-4 py-8 focus:outline-none sm:py-14">
        <div className="mx-auto w-full max-w-[30rem] rounded border border-line bg-white px-5 py-7 sm:px-10 sm:py-9">{children}</div>
      </main>
      <SiteFooter className="mt-0" />
    </div>
  );
}
