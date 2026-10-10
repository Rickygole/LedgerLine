import { cookies } from "next/headers";
import { roleLabel, type CurrentUser } from "@/lib/auth";
import { NAV_COOKIE, NAV_MORE_COOKIE } from "./nav-cookie";
import { NavDrawer, SideNav, TopTabs } from "./nav-links";
import { NavProgress } from "./nav-progress";
import { SiteFooter } from "./site-footer";
import { BrandBar } from "./site-header";
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
  const subtitle = isCbo ? "Organization portal" : "Finance workspace";
  const home = isCbo ? "/portal" : "/finance";
  const store = await cookies();
  const collapsed = !isCbo && store.get(NAV_COOKIE)?.value === "collapsed";
  const moreOpen = !isCbo && store.get(NAV_MORE_COOKIE)?.value === "open";

  const header = (
    <header className="no-print relative z-30">
      <BrandBar home={home} homeLabel={`LedgerLine ${subtitle} home`} before={<NavDrawer role={user.role} subtitle={subtitle} className={isCbo ? "md:hidden" : "lg:hidden"} />}>
        <UserMenu name={user.fullName} initials={initials(user.fullName)} email={user.email} roleText={roleLabel(user.role)} orgText={isCbo ? user.orgName : null} />
      </BrandBar>
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
          <div className="mx-auto max-w-[1376px] px-4 sm:px-8">
            <TopTabs role={user.role} />
          </div>
        </div>
        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1376px] flex-1 px-4 pb-8 pt-6 focus:outline-none sm:px-8 sm:pt-8">
          {children}
        </main>
        <SiteFooter signedIn />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavProgress />
      {skip}
      {header}
      <div className="flex flex-1">
        <SideNav role={user.role} initialCollapsed={collapsed} moreOpen={moreOpen} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1376px] flex-1 px-4 pb-8 pt-6 focus:outline-none sm:px-6 sm:pt-8">
            {children}
          </main>
          <SiteFooter signedIn />
        </div>
      </div>
    </div>
  );
}
