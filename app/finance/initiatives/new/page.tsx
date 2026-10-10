import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatCurrency, plural } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NewInitiativeForm } from "@/components/finance/admin/new-initiative-form";
import { AssignOrgsForm } from "@/components/finance/admin/assign-orgs-form";
import { TemplateChoiceForm } from "@/components/finance/admin/template-choice-form";
import { listCategories, nextInitiativeCode } from "@/lib/finance/admin/initiatives";
import { one, type SearchParams } from "@/lib/finance/admin/params";
import { isUuid } from "@/lib/ids";
import { cn } from "@/lib/cn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New initiative" };

const STEPS = ["Initiative details", "Assign organizations", "Report form"];

export default async function NewInitiativePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(["finance_admin"]);
  const params = await searchParams;
  const initiativeId = one(params, "initiative");
  const step = initiativeId ? (one(params, "step") === "3" ? 3 : 2) : 1;
  if (initiativeId && !isUuid(initiativeId)) notFound();

  const data = await withClaims(user.id, async (tx) => {
    if (step === 1) {
      const categories = await listCategories(tx);
      return { categories, nextCode: await nextInitiativeCode(tx, "FY27"), initiative: null, assigned: [], orgs: [] };
    }
    const initiative = await tx.one<{ id: string; code: string; name: string; total_funding: string }>(`SELECT id, code, name, total_funding FROM initiative WHERE id = $1`, [initiativeId]);
    if (!initiative) return undefined;
    const assigned = await tx.query<{ legal_name: string; award_amount: string }>(
      `SELECT o.legal_name, a.award_amount FROM assignment a JOIN organization o ON o.id = a.org_id WHERE a.initiative_id = $1 ORDER BY o.legal_name`,
      [initiativeId]
    );
    const orgs = step === 2 ? await tx.query<{ id: string; name: string; ein: string; borough: string }>(
      `SELECT id, legal_name AS name, ein, borough FROM organization o WHERE NOT EXISTS (SELECT 1 FROM assignment a WHERE a.org_id = o.id AND a.initiative_id = $1) ORDER BY legal_name`,
      [initiativeId]
    ) : [];
    return { categories: [] as string[], nextCode: "", initiative, assigned, orgs };
  });
  if (!data) notFound();

  return (
    <>
      <PageHeader
        title="New initiative"
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Initiatives", href: "/finance/initiatives" }, { label: "New initiative" }]}
      />
      <ol className="mb-6 flex flex-wrap gap-3" aria-label="Progress">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const done = number < step;
          const current = number === step;
          return (
            <li key={label} aria-current={current ? "step" : undefined} className={cn("flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-semibold ring-1 ring-inset", current ? "bg-navy-800 text-white ring-navy-800" : done ? "bg-ok-bg text-ok ring-ok/20" : "bg-white text-muted ring-line")}>
              {done ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="num">{number}</span>}
              {label}
              {done ? <span className="sr-only"> (completed)</span> : null}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <Card>
          <CardHeader title="Step 1 of 3: Initiative details" />
          <CardBody>
            <NewInitiativeForm categories={data.categories} nextCode={data.nextCode} />
          </CardBody>
        </Card>
      ) : null}

      {step === 2 && data.initiative ? (
        <Card>
          <CardHeader title="Step 2 of 3: Assign organizations" description={`${data.initiative.code} ${data.initiative.name}`} />
          <CardBody>
            {data.assigned.length > 0 ? (
              <div className="mb-6 rounded-md bg-surface/70 p-4 text-sm">
                <p className="font-semibold">Already assigned</p>
                <ul className="mt-1 space-y-0.5">
                  {data.assigned.map((a) => (
                    <li key={a.legal_name}>
                      {a.legal_name} <span className="num text-muted">{formatCurrency(Number(a.award_amount))}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`/finance/initiatives/new?step=3&initiative=${data.initiative.id}`} className="mt-3 inline-block font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                  Continue to the report form
                </Link>
              </div>
            ) : null}
            <AssignOrgsForm initiativeId={data.initiative.id} orgs={data.orgs} />
          </CardBody>
        </Card>
      ) : null}

      {step === 3 && data.initiative ? (
        <Card>
          <CardHeader title="Step 3 of 3: Report form" description={`${data.initiative.code} ${data.initiative.name}, funded at ${formatCurrency(Number(data.initiative.total_funding))} across ${data.assigned.length} ${plural(data.assigned.length, "organization", "organizations")}.`} />
          <CardBody>
            <TemplateChoiceForm initiativeId={data.initiative.id} />
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
