import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { one, type SearchParams } from "@/lib/finance/admin/params";
import { rolloverInitiatives, validFiscalYear } from "@/lib/lifecycle/rollover";
import { PageHeader } from "@/components/ui/page-header";
import { RolloverWizard } from "@/components/finance/lifecycle/rollover-wizard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rollover plan" };

export default async function RolloverPlanPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireUser(["finance_admin"]);
  const params = await searchParams;
  const from = one(params, "from");
  const to = one(params, "to");
  if (!validFiscalYear(from) || !validFiscalYear(to)) notFound();
  const initiatives = await withClaims(admin.id, (tx) => rolloverInitiatives(tx, from));
  return (
    <>
      <PageHeader
        title={`Plan the rollover from ${from} to ${to}`}
        description="Choose what happens to each initiative. Carry forward is selected by default."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Annual rollover", href: `/finance/rollover?from=${from}&to=${to}` }, { label: "Plan" }]}
      />
      <RolloverWizard from={from} to={to} initiatives={initiatives} />
    </>
  );
}
