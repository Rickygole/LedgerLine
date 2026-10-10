import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { one, type SearchParams } from "@/lib/finance/admin/params";
import { fiscalYears, rolloverInitiatives, validFiscalYear } from "@/lib/lifecycle/rollover";
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
  if (Number(to.slice(2)) <= Number(from.slice(2))) redirect(`/finance/rollover?from=${from}&to=${to}`);
  const data = await withClaims(admin.id, async (tx) => {
    if (!(await fiscalYears(tx)).includes(from)) return null;
    const initiatives = await rolloverInitiatives(tx, from);
    const forms = await tx.query<{ initiative_id: string; version: number; questions: number }>(
      `SELECT DISTINCT ON (f.initiative_id) f.initiative_id, f.version,
              (SELECT count(*)::int FROM jsonb_array_elements(f.definition->'sections') s, jsonb_array_elements(s->'questions') q) AS questions
       FROM form_version f JOIN initiative i ON i.id = f.initiative_id
       WHERE i.fiscal_year_id = $1 AND f.status = 'published'
       ORDER BY f.initiative_id, f.version DESC`,
      [from],
    );
    return {
      initiatives,
      forms: forms.map((f) => ({ initiativeId: f.initiative_id, version: f.version, questions: f.questions })),
    };
  });
  if (!data) redirect("/finance/rollover");
  const { initiatives, forms } = data;
  return (
    <>
      <PageHeader
        title={`Roll ${from} into ${to}`}
        description="Decide what happens to each initiative, check the forms that come along, then confirm. Nothing is saved until the last step."
        crumbs={[
          { label: "Dashboard", href: "/finance" },
          { label: "Annual rollover", href: `/finance/rollover?from=${from}&to=${to}` },
          { label: "Plan and confirm" },
        ]}
      />
      <RolloverWizard from={from} to={to} initiatives={initiatives} forms={forms} />
    </>
  );
}
