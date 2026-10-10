import "server-only";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { withClaims } from "@/lib/db";
import { SESSION_COOKIE, verifySessionClaims } from "@/lib/session";

export type Role = "cbo_submitter" | "finance_viewer" | "finance_analyst" | "finance_admin";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  title: string | null;
  role: Role;
  orgId: string | null;
  orgName: string | null;
  ein: string | null;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const claims = await verifySessionClaims(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  return withClaims(claims.sub, async (tx) => {
    const row = await tx.one<{
      id: string;
      email: string;
      full_name: string;
      title: string | null;
      role: Role;
      org_id: string | null;
      legal_name: string | null;
      ein: string | null;
    }>(
      `SELECT u.id, u.email, u.full_name, u.title, u.role, u.org_id, o.legal_name, o.ein
       FROM app_user u LEFT JOIN organization o ON o.id = u.org_id
       WHERE u.id = app.uid() AND u.active AND app.session_valid($1::uuid, $2::int)`,
      [claims.jti, claims.version],
    );
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      title: row.title,
      role: row.role,
      orgId: row.org_id,
      orgName: row.legal_name,
      ein: row.ein,
    };
  });
});

export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) forbidden();
  return user;
}

export const FINANCE_ROLES: Role[] = ["finance_viewer", "finance_analyst", "finance_admin"];
export const REVIEW_ROLES: Role[] = ["finance_analyst", "finance_admin"];

export function homeFor(role: Role): string {
  if (role === "cbo_submitter") return "/portal";
  return role === "finance_admin" ? "/finance/initiatives" : "/finance";
}

export function roleLabel(role: Role): string {
  return {
    cbo_submitter: "Reporting organization",
    finance_viewer: "Finance (view only)",
    finance_analyst: "Finance analyst",
    finance_admin: "Finance administrator",
  }[role];
}
