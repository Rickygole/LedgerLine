import Link from "next/link";
import { roleLabel, type CurrentUser } from "@/lib/auth";
import { Logo } from "./logo";
import { NavLinks, type NavItem } from "./nav-links";
import { CreditFooter, SyntheticBanner } from "./synthetic-banner";
import { UserMenu } from "./user-menu";

const FINANCE_NAV: NavItem[] = [
  { href: "/finance", label: "Dashboard", exact: true },
  { href: "/finance/submissions", label: "Submissions" },
  { href: "/finance/flagged", label: "Flagged items" },
  { href: "/finance/organizations", label: "Organizations" },
  { href: "/finance/initiatives", label: "Initiatives" },
  { href: "/finance/queries", label: "Saved queries" },
  { href: "/finance/reminders", label: "Reminders" },
  { href: "/finance/outbox", label: "Outbox" },
  { href: "/finance/audit", label: "Audit log" },
  { href: "/finance/rollover/lineage", label: "Lineage" },
  { href: "/finance/platform", label: "Platform" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/finance/rollover", label: "Rollover", exact: true },
  { href: "/finance/users", label: "Users" },
];

const PORTAL_NAV: NavItem[] = [
  { href: "/portal", label: "My reports", exact: true },
  { href: "/portal/history", label: "Submission history" },
  { href: "/portal/organization", label: "Organization profile" },
  { href: "/portal/messages", label: "Messages" },
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
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SyntheticBanner />
      <header className="no-print on-dark bg-navy-900 text-white">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href={isCbo ? "/portal" : "/finance"} className="shrink-0 rounded-md" aria-label={`LedgerLine ${isCbo ? "Initiative Reporting Portal" : "Council Finance Workspace"} home`}>
              <Logo subtitle={isCbo ? "Initiative Reporting Portal" : "Council Finance Workspace"} />
            </Link>
            <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-navy-100 md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true" />
              Demo environment
            </span>
          </div>
          <UserMenu name={user.fullName} initials={initials(user.fullName)} email={user.email} roleText={roleLabel(user.role)} orgText={isCbo ? user.orgName : "New York City Council Finance Division"} />
        </div>
      </header>
      <div className="no-print border-b border-line bg-white">
        <div className="mx-auto max-w-[1440px] px-1 sm:px-3">
          <NavLinks items={nav} />
        </div>
      </div>
      <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8">
        {children}
      </main>
      <CreditFooter />
    </div>
  );
}
