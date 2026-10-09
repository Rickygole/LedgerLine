import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/session";
import { roleLabel, type CurrentUser } from "@/lib/auth";
import { Logo } from "./logo";
import { NavLinks, type NavItem } from "./nav-links";
import { CreditFooter, SyntheticBanner } from "./synthetic-banner";

const FINANCE_NAV: NavItem[] = [
  { href: "/finance", label: "Dashboard", exact: true },
  { href: "/finance/submissions", label: "Submissions" },
  { href: "/finance/flagged", label: "Flagged items" },
  { href: "/finance/organizations", label: "Organizations" },
  { href: "/finance/initiatives", label: "Initiatives" },
  { href: "/finance/outbox", label: "Outbox" },
  { href: "/finance/audit", label: "Audit log" },
];

const ADMIN_NAV: NavItem[] = [{ href: "/finance/users", label: "Users" }];

const PORTAL_NAV: NavItem[] = [
  { href: "/portal", label: "My reports", exact: true },
  { href: "/portal/history", label: "Submission history" },
  { href: "/portal/organization", label: "Organization profile" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const isCbo = user.role === "cbo_submitter";
  const nav = isCbo ? PORTAL_NAV : user.role === "finance_admin" ? [...FINANCE_NAV, ...ADMIN_NAV] : FINANCE_NAV;
  return (
    <div className="flex min-h-screen flex-col">
      <SyntheticBanner />
      <header className="no-print bg-navy-900 text-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6 px-4 sm:px-6">
          <Link href={isCbo ? "/portal" : "/finance"} className="shrink-0 rounded-md">
            <Logo subtitle={isCbo ? "Initiative Reporting Portal" : "Council Finance Workspace"} />
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight">{user.fullName}</p>
              <p className="text-xs leading-tight text-navy-100/80">{isCbo ? user.orgName : roleLabel(user.role)}</p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-700 text-sm font-bold ring-2 ring-navy-600" aria-hidden="true">
              {initials(user.fullName)}
            </span>
            <form action={signOut}>
              <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-navy-100 hover:bg-navy-800 hover:text-white">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Sign out</span>
              </button>
            </form>
          </div>
        </div>
        <div className="border-t border-white/10 bg-navy-800">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6">
            <NavLinks items={nav} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <CreditFooter />
    </div>
  );
}
