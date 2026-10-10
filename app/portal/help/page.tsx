import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { one, type SearchParams } from "@/lib/finance/admin/params";
import { HelpPage } from "@/components/ops/help-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Get help" };

export default async function PortalHelp({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(["cbo_submitter"]);
  const params = await searchParams;
  return (
    <HelpPage
      user={user}
      home={{ label: "My reports", href: "/portal" }}
      base="/portal/help"
      selected={one(params, "request")}
    />
  );
}
