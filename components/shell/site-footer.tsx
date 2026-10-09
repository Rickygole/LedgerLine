import Link from "next/link";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/accessibility", label: "Accessibility" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/help", label: "Help" },
];

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("no-print mt-16 border-t border-line bg-white", className)}>
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        <nav aria-label="Site information">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-link underline underline-offset-2 hover:text-link-hover">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="bg-navy-950 text-navy-100">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-1 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>&copy; 2026 LedgerLine</p>
          <p>Support: Monday to Friday, 9 AM to 5 PM ET</p>
        </div>
      </div>
    </footer>
  );
}
