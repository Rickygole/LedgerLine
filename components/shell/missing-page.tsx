"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, Lock, SearchX } from "lucide-react";
import type { Role } from "@/lib/auth";
import { ButtonLink } from "@/components/ui/button";
import { StatusPanel } from "./status-page";

const ADMIN_ONLY = ["/finance/users", "/finance/rollover/plan", "/finance/rollover/result", "/finance/initiatives/new"];

function deniedFor(path: string, role: Role | null): boolean {
  if (!role) return false;
  const finance = path === "/finance" || path.startsWith("/finance/");
  const portal = path === "/portal" || path.startsWith("/portal/");
  if (role === "cbo_submitter") return finance;
  if (portal) return true;
  if (role === "finance_admin") return false;
  return path === "/finance/rollover" || ADMIN_ONLY.some((p) => path === p || path.startsWith(`${p}/`));
}

export function ForbiddenPanel({ role, roleText, portalArea = false }: { role: Role | null; roleText: string | null; portalArea?: boolean }) {
  const home = role === "cbo_submitter" ? "/portal" : role ? "/finance" : "/login";
  const body = portalArea && role && role !== "cbo_submitter"
    ? "This page is part of the portal that funded organizations use to file reports. Finance staff see the same reports under Submissions."
    : role === "cbo_submitter"
      ? "This page is for Council Finance staff. Your account is set up to report for your organization."
      : role && role !== "finance_admin"
        ? `Your role is ${roleText}. Ask a Finance administrator if you need access to this page.`
        : "This page is for a different kind of account. Sign in with the account that has access, or ask your LedgerLine administrator.";
  return (
    <StatusPanel
      icon={Lock}
      eyebrow="Access restricted"
      title="You do not have access to this page"
      actions={
        <ButtonLink href={home}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {role ? "Back to dashboard" : "Sign in"}
        </ButtonLink>
      }
    >
      <p>{body}</p>
    </StatusPanel>
  );
}

export function MissingPage({ role, roleText }: { role: Role | null; roleText: string | null }) {
  const pathname = usePathname();
  if (deniedFor(pathname, role)) return <ForbiddenPanel role={role} roleText={roleText} portalArea={pathname === "/portal" || pathname.startsWith("/portal/")} />;
  const home = role === "cbo_submitter" ? "/portal" : role ? "/finance" : "/login";
  const label = role === "cbo_submitter" ? "Go to My reports" : role ? "Go to your dashboard" : "Go to sign in";
  return (
    <StatusPanel
      icon={SearchX}
      eyebrow="Page not found"
      title="We could not find that page"
      actions={<ButtonLink href={home}>{label}</ButtonLink>}
      footnote="If a link inside LedgerLine brought you here, let your LedgerLine administrator know."
    >
      <p>The page you asked for does not exist or has moved. Check the address, or start again from your dashboard.</p>
    </StatusPanel>
  );
}
