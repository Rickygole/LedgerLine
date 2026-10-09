import { cn } from "@/lib/cn";
import { LogoMark } from "./logo";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("no-print mt-16 border-t border-line bg-white", className)}>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span className="flex items-center gap-2.5">
          <LogoMark className="h-4 w-4 shrink-0 opacity-70" />
          <span>&copy; 2026 LedgerLine. Initiative reporting for Council-funded programs.</span>
        </span>
        <span className="text-muted">Need help? Contact Council Finance, Initiative Reporting.</span>
      </div>
    </footer>
  );
}
