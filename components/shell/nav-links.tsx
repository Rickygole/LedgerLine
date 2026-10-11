"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  BellRing,
  Settings,
  Bookmark,
  Building2,
  FileText,
  Flag,
  FolderKanban,
  GitBranch,
  History,
  Inbox,
  Library,
  LayoutDashboard,
  LineChart,
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

const under =
  (...prefixes: string[]) =>
  (path: string) =>
    prefixes.some((p) => path === p || path.startsWith(`${p}/`));
const exactly = (href: string) => (path: string) => path === href;

const FINANCE: NavGroup[] = [
  {
    label: "Review",
    items: [
      { href: "/finance", label: "Dashboard", icon: LayoutDashboard, match: exactly("/finance") },
      { href: "/finance/submissions", label: "Submissions", icon: Inbox, match: under("/finance/submissions") },
      { href: "/finance/flagged", label: "Flagged items", icon: Flag, match: under("/finance/flagged") },
    ],
  },
  {
    label: "Programs",
    items: [
      {
        href: "/finance/initiatives",
        label: "Initiatives",
        icon: FolderKanban,
        match: under("/finance/initiatives", "/finance/forms"),
      },
      {
        href: "/finance/organizations",
        label: "Organizations",
        icon: Building2,
        match: under("/finance/organizations"),
      },
      {
        href: "/finance/question-library",
        label: "Question library",
        icon: Library,
        match: under("/finance/question-library"),
      },
    ],
  },
  {
    label: "Communications",
    items: [{ href: "/finance/reminders", label: "Reminders", icon: BellRing, match: under("/finance/reminders") }],
  },
  {
    label: "Records",
    items: [
      { href: "/finance/queries", label: "Saved queries", icon: Bookmark, match: under("/finance/queries") },
      { href: "/finance/trends", label: "Trends", icon: LineChart, match: under("/finance/trends") },
      { href: "/finance/outbox", label: "Outbox", icon: Send, match: under("/finance/outbox") },
      { href: "/finance/audit", label: "Audit log", icon: ScrollText, match: under("/finance/audit") },
    ],
  },
  {
    label: "Setup",
    items: [
      {
        href: "/finance/rollover",
        label: "Annual rollover",
        icon: RefreshCw,
        match: (p) => under("/finance/rollover")(p) && !under("/finance/rollover/lineage")(p),
        roles: ["finance_admin"],
      },
      {
        href: "/finance/rollover/lineage",
        label: "Lineage",
        icon: GitBranch,
        match: under("/finance/rollover/lineage"),
      },
      { href: "/finance/users", label: "Users", icon: Users, match: under("/finance/users"), roles: ["finance_admin"] },
      { href: "/finance/platform", label: "Platform", icon: ShieldCheck, match: under("/finance/platform") },
      {
        href: "/finance/admin",
        label: "Administration",
        icon: Settings,
        match: under(
          "/finance/admin",
          "/finance/support",
          "/finance/incidents",
          "/finance/reviews",
          "/finance/readiness",
          "/finance/data",
        ),
        roles: ["finance_admin"],
      },
    ],
  },
];

const PORTAL: NavGroup[] = [
  {
    items: [
      {
        href: "/portal",
        label: "My reports",
        icon: FileText,
        match: (p) => p === "/portal" || under("/portal/reports")(p),
      },
      { href: "/portal/history", label: "Submission history", icon: History, match: under("/portal/history") },
      { href: "/portal/organization", label: "Organization", icon: Building2, match: under("/portal/organization") },
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

function NavLinkItem({
  item,
  active,
  compact,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        prefetch={false}
        onClick={onNavigate}
        title={compact ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group/nav relative flex h-9 items-center gap-3 rounded-sm text-[15px]",
          compact ? "justify-center px-0" : "px-3",
          active
            ? "bg-harbor-50 font-bold text-harbor-900"
            : "text-ink-2 hover:bg-surface hover:text-link hover:underline",
        )}
      >
        {active ? <span aria-hidden="true" className="absolute inset-y-1 left-0 w-1 rounded-sm bg-action" /> : null}
        <Icon className={cn("h-5 w-5 shrink-0", active ? "text-action" : "text-muted group-hover/nav:text-link")} />
        <span className={compact ? "sr-only" : "truncate"}>{item.label}</span>
      </Link>
    </li>
  );
}

function NavList({ role, onNavigate, compact = false }: { role: Role; onNavigate?: () => void; compact?: boolean }) {
  const pathname = usePathname();
  const groups = groupsFor(role);
  return (
    <div className="space-y-3">
      {groups.map((group, index) => {
        const list = (
          <ul className="space-y-px">
            {group.items.map((item) => (
              <NavLinkItem
                key={item.href}
                item={item}
                active={item.match(pathname)}
                compact={compact}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        );
        return (
          <div key={group.label ?? index}>
            {group.label && !compact ? (
              <p className="mb-0.5 px-3 text-[13px] font-semibold leading-5 text-muted">{group.label}</p>
            ) : null}
            {group.label && compact && index > 0 ? <hr className="mx-2 mb-3 border-line" /> : null}
            {list}
          </div>
        );
      })}
    </div>
  );
}

export function SideNav({ role, initialCollapsed = false }: { role: Role; initialCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname, collapsed]);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
  };
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <aside
      className={cn("no-print hidden shrink-0 border-r border-line bg-white lg:block", collapsed ? "w-16" : "w-56")}
    >
      <div className="sticky top-0 flex max-h-dvh flex-col">
        <div className={cn("flex items-center pt-4", collapsed ? "justify-center px-2" : "justify-between pl-6 pr-3")}>
          {collapsed ? null : <p className="text-sm font-semibold text-ink-2">Finance workspace</p>}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            className="flex h-9 w-9 items-center justify-center rounded-sm text-muted hover:bg-surface hover:text-link"
          >
            <Toggle className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <nav
          ref={navRef}
          aria-label="Main"
          className={cn("flex-1 overflow-y-auto pb-4 pt-2", collapsed ? "px-2" : "px-3")}
        >
          <NavList role={role} compact={collapsed} />
        </nav>
      </div>
    </aside>
  );
}

export function TopTabs({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = groupsFor(role).flatMap((group) => group.items);
  return (
    <nav aria-label="Main" className="-mb-px flex flex-wrap gap-x-7">
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap border-b-[3px] py-3.5 text-[15px] font-semibold",
              active
                ? "border-action text-harbor-900"
                : "border-transparent text-ink-2 hover:border-line-strong hover:text-link",
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
        className={cn(
          "-ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded text-white hover:bg-harbor-800",
          className,
        )}
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
          <div className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b-4 border-harbor-600 bg-harbor-900 px-4">
            <Logo compact />
            <button
              type="button"
              onClick={close}
              className="flex h-10 w-10 items-center justify-center rounded text-white hover:bg-harbor-800"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <p className="px-6 pt-5 text-sm font-semibold text-ink-2">{subtitle}</p>
          <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-5 pt-3">
            <NavList role={role} onNavigate={close} />
          </nav>
        </div>
      </dialog>
    </>
  );
}
