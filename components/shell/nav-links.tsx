"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  BellRing,
  Bookmark,
  Building2,
  FileText,
  Flag,
  FolderKanban,
  GitBranch,
  History,
  Inbox,
  LayoutDashboard,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ScrollText,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/auth";
import { Logo } from "./logo";
import { NAV_COOKIE } from "./nav-cookie";

type Icon = ComponentType<{ className?: string }>;
type NavItem = { href: string; label: string; icon: Icon; match: (path: string) => boolean; roles?: Role[] };
type NavGroup = { label?: string; items: NavItem[] };

const under = (...prefixes: string[]) => (path: string) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));
const exactly = (href: string) => (path: string) => path === href;

const FINANCE: NavGroup[] = [
  {
    label: "Review",
    items: [
      { href: "/finance", label: "Dashboard", icon: LayoutDashboard, match: exactly("/finance") },
      { href: "/finance/submissions", label: "Submissions", icon: Inbox, match: under("/finance/submissions") },
      { href: "/finance/flagged", label: "Flagged items", icon: Flag, match: under("/finance/flagged") },
      { href: "/finance/queries", label: "Saved queries", icon: Bookmark, match: under("/finance/queries") },
    ],
  },
  {
    label: "Programs",
    items: [
      { href: "/finance/initiatives", label: "Initiatives", icon: FolderKanban, match: under("/finance/initiatives", "/finance/forms") },
      { href: "/finance/organizations", label: "Organizations", icon: Building2, match: under("/finance/organizations") },
    ],
  },
  {
    label: "Communications",
    items: [
      { href: "/finance/reminders", label: "Reminders", icon: BellRing, match: under("/finance/reminders") },
      { href: "/finance/outbox", label: "Outbox", icon: Send, match: under("/finance/outbox") },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/finance/audit", label: "Audit log", icon: ScrollText, match: under("/finance/audit") },
      { href: "/finance/rollover", label: "Annual rollover", icon: RefreshCw, match: (p) => under("/finance/rollover")(p) && !under("/finance/rollover/lineage")(p), roles: ["finance_admin"] },
      { href: "/finance/rollover/lineage", label: "Lineage", icon: GitBranch, match: under("/finance/rollover/lineage") },
      { href: "/finance/users", label: "Users", icon: Users, match: under("/finance/users"), roles: ["finance_admin"] },
      { href: "/finance/platform", label: "Platform", icon: ShieldCheck, match: under("/finance/platform") },
    ],
  },
];

const PORTAL: NavGroup[] = [
  {
    items: [
      { href: "/portal", label: "My reports", icon: FileText, match: (p) => p === "/portal" || under("/portal/reports")(p) },
      { href: "/portal/history", label: "Submission history", icon: History, match: under("/portal/history") },
      { href: "/portal/organization", label: "Organization profile", icon: Building2, match: under("/portal/organization") },
      { href: "/portal/messages", label: "Messages", icon: Mail, match: under("/portal/messages") },
    ],
  },
];

function groupsFor(role: Role): NavGroup[] {
  const source = role === "cbo_submitter" ? PORTAL : FINANCE;
  return source
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(role)) }))
    .filter((group) => group.items.length > 0);
}

function NavList({ role, onNavigate, compact = false }: { role: Role; onNavigate?: () => void; compact?: boolean }) {
  const pathname = usePathname();
  return (
    <div className={compact ? "space-y-3" : "space-y-6"}>
      {groupsFor(role).map((group, index) => (
        <div key={group.label ?? index}>
          {group.label && !compact ? <p className="mb-1 px-3 text-xs font-bold text-muted">{group.label}</p> : null}
          {group.label && compact && index > 0 ? <hr className="mx-2 mb-3 border-line" /> : null}
          <ul className="divide-y divide-line border-y border-line">
            {group.items.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={compact ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group/nav relative flex h-10 items-center gap-2.5 text-sm",
                      compact ? "justify-center px-0" : "px-3",
                      active ? "bg-navy-50 font-bold text-link" : "text-ink hover:bg-surface hover:text-link hover:underline"
                    )}
                  >
                    {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-action" /> : null}
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-link" : "text-muted group-hover/nav:text-link")} />
                    <span className={compact ? "sr-only" : "truncate"}>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SideNav({ role, initialCollapsed = false }: { role: Role; initialCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside className={cn("no-print hidden shrink-0 border-r border-line bg-white lg:block", collapsed ? "w-16" : "w-56")}>
      <div className="sticky top-0 flex max-h-dvh flex-col">
        <nav aria-label="Main" className={cn("flex-1 overflow-y-auto py-6", collapsed ? "px-2" : "px-3")}>
          <NavList role={role} compact={collapsed} />
        </nav>
        <div className={cn("border-t border-line py-3", collapsed ? "px-2" : "px-3")}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand menu" : undefined}
            className={cn("flex h-9 w-full items-center gap-2.5 rounded-sm text-sm text-link underline underline-offset-2 hover:bg-surface hover:text-link-hover", collapsed ? "justify-center" : "px-3")}
          >
            <Toggle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className={collapsed ? "sr-only" : undefined}>{collapsed ? "Expand menu" : "Collapse menu"}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

export function TopTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = groupsFor(role).flatMap((group) => group.items);
  return (
    <nav aria-label="Main" className="-mb-px flex gap-0.5">
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap border-b-4 px-3 py-3 text-sm focus-visible:-outline-offset-4",
              active ? "border-action font-bold text-link" : "border-transparent text-ink hover:border-line-strong hover:text-link hover:underline"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavDrawer({ role, subtitle, className }: { role: Role; subtitle: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={cn("-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded text-white hover:bg-navy-800", className)}
        aria-label="Open menu"
        aria-haspopup="dialog"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>
      <dialog
        ref={ref}
        aria-label="Menu"
        className="nav-drawer m-0 h-dvh max-h-dvh w-[min(20rem,86vw)] max-w-none overflow-hidden border-0 border-r border-line bg-white p-0 text-ink"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 bg-navy-900 px-4">
            <Logo subtitle={subtitle} />
            <button type="button" onClick={close} className="flex h-9 w-9 items-center justify-center rounded text-white hover:bg-navy-800" aria-label="Close menu">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-5">
            <NavList role={role} onNavigate={close} />
          </nav>
        </div>
      </dialog>
    </>
  );
}
