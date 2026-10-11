import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function AuthFrame({ children, signInLink = false }: { children: React.ReactNode; signInLink?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader signIn={signInLink} />
      <main id="main" tabIndex={-1} className="flex-1 px-4 pb-16 pt-10 focus:outline-none sm:pt-12">
        <div className="mx-auto w-full max-w-[480px]">{children}</div>
      </main>
      <SiteFooter className="mt-0" signedIn width="max-w-[1120px]" />
    </div>
  );
}
