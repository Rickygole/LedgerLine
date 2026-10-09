import Link from "next/link";
import { cookies } from "next/headers";
import { roleLabel, type CurrentUser } from "@/lib/auth";
import { Logo } from "./logo";
import { NAV_COOKIE } from "./nav-cookie";
import { NavDrawer, SideNav, TopTabs } from "./nav-links";
import { NavProgress } from "./nav-progress";
import { SiteFooter } from "./site-footer";
import { UserMenu } from "./user-menu";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const isCbo = user.role === "cbo_submitter";
  const subtitle = isCbo ? "Program reporting portal" : "Finance workspace";
  const home = isCbo ? "/portal" : "/finance";
  const collapsed = !isCbo && (await cookies()).get(NAV_COOKIE)?.value === "collapsed";

  const header = (
    <header className="no-print relative z-30 bg-navy-900 text-white">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <NavDrawer role={user.role} subtitle={subtitle} className={isCbo ? "md:hidden" : "lg:hidden"} />
          <Link href={home} className="shrink-0 rounded-sm" aria-label={`LedgerLine ${subtitle} home`}>
            <Logo subtitle={subtitle} />
          </Link>
        </div>
        <UserMenu name={user.fullName} initials={initials(user.fullName)} email={user.email} roleText={roleLabel(user.role)} orgText={isCbo ? user.orgName : null} />
      </div>
    </header>
  );

  const skip = (
    <a href="#main" className="skip-link">
      Skip to main content
    </a>
  );

  if (isCbo) {
    return (
      <div className="flex min-h-screen flex-col">
        <NavProgress />
        {skip}
        {header}
        <div className="no-print hidden border-b border-line bg-white md:block">
          <div className="mx-auto max-w-[1440px] px-3">
            <TopTabs role={user.role} />
          </div>
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1440px] flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8">
          {children}
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavProgress />
      {skip}
      {header}
      <div className="flex flex-1">
        <SideNav role={user.role} initialCollapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1360px] flex-1 px-4 py-6 focus:outline-none sm:px-6 sm:py-8">
            {children}
          </main>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
