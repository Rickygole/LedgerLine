import { cn } from "@/lib/cn";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function PlainFrame({ children, tone = "surface", wide = false }: { children: React.ReactNode; tone?: "surface" | "white"; wide?: boolean }) {
  return (
    <div className={cn("flex min-h-screen flex-col", tone === "white" ? "bg-white" : "bg-surface")}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className={cn("w-full flex-1 focus:outline-none", wide ? "" : "mx-auto max-w-[1376px] px-4 pb-8 pt-8 sm:px-8")}>
        {children}
      </main>
      <SiteFooter className={wide ? "mt-0" : undefined} width={wide ? "max-w-[1120px]" : undefined} />
    </div>
  );
}
