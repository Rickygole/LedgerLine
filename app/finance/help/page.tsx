import type { Metadata } from "next";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { one, type SearchParams } from "@/lib/finance/admin/params";
import { HelpPage } from "@/components/ops/help-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get help" };

export default async function FinanceHelp({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const params = await searchParams;
  return <HelpPage user={user} home={{ label: "Dashboard", href: "/finance" }} base="/finance/help" selected={one(params, "request")} />;
}
