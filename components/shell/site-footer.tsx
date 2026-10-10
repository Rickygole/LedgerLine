import Link from "next/link";
import { cn } from "@/lib/cn";
import { Logo } from "./logo";

const link = "text-white underline underline-offset-2 hover:decoration-2";

export function SiteFooter({
  className,
  signedIn = false,
  width = "max-w-[1376px]",
}: {
  className?: string;
  signedIn?: boolean;
  width?: string;
}) {
  const service = [
    ...(signedIn ? [] : [{ href: "/login", label: "Sign in" }]),
    { href: "/help", label: "Help and contact" },
  ];
  const about = [
    { href: "/accessibility", label: "Accessibility" },
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms of use" },
  ];
  return (
    <footer className={cn("no-print mt-16 bg-harbor-950 text-sm leading-[22px] text-harbor-200", className)}>
      <div className={cn("mx-auto px-4 pb-7 pt-9 sm:px-8", width)}>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-[2fr_1fr_1fr] sm:gap-10">
          <div className="col-span-2 sm:col-span-1">
            <Logo />
            <p className="mt-3.5 max-w-[420px]">
              Reporting for organizations that receive New York City Council discretionary funding, and review tools for
              the Council Finance Division.
            </p>
          </div>
          <nav aria-labelledby="footer-service">
            <h2 id="footer-service" className="mb-2 text-sm font-semibold text-white">
              Service
            </h2>
            <ul className="space-y-1">
              {service.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={link}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-labelledby="footer-about">
            <h2 id="footer-about" className="mb-2 text-sm font-semibold text-white">
              About
            </h2>
            <ul className="space-y-1">
              {about.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={link}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="mt-7 flex flex-col gap-2 border-t border-harbor-800 pt-4 text-[13px] leading-5 sm:flex-row sm:justify-between sm:gap-6">
          <p>LedgerLine is not an official City of New York website. Dates and times are Eastern Time.</p>
          <p>Support: Monday to Friday, 9 AM to 5 PM ET</p>
        </div>
      </div>
    </footer>
  );
}
