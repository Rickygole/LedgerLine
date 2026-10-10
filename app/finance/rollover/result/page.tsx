import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { one, type SearchParams } from "@/lib/finance/admin/params";
import { rolloverResult, validFiscalYear } from "@/lib/lifecycle/rollover";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { RolloverSteps } from "@/components/finance/lifecycle/rollover-steps";
import { plural } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rollover result" };

export default async function RolloverResultPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireUser(["finance_admin"]);
  const params = await searchParams;
  const from = one(params, "from");
  const to = one(params, "to");
  if (!validFiscalYear(from) || !validFiscalYear(to)) notFound();
  const result = await withClaims(admin.id, (tx) => rolloverResult(tx, from, to));
  if (!result) notFound();
  const tiles: [string, number][] = [
    ["Carried forward", result.carried],
    ["Renamed", result.renamed],
    ["Combined into", result.combined],
    ["Retired", result.retired],
    ["New initiatives", result.created],
    ["Awards", result.assignments],
    ["Published forms", result.forms],
  ];
  return (
    <>
      <PageHeader
        title={`Rollover into ${to} is complete`}
        description={`Initiatives from ${from} now continue in ${to}. Each change was written to the audit log.`}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Annual rollover", href: "/finance/rollover" }, { label: "Result" }]}
        actions={
          <>
            <ButtonLink href="/finance/rollover/lineage" variant="secondary">
              View lineage
            </ButtonLink>
            <ButtonLink href={`/finance/initiatives?q=CI-${to.slice(2)}`}>Open {to} initiatives</ButtonLink>
          </>
        }
      />
      <RolloverSteps current={5} />
      <Card className="mb-6">
        <CardBody>
          <p className="flex items-center gap-2 text-sm font-semibold text-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {result.created} {plural(result.created, "initiative", "initiatives")}, {result.assignments} {plural(result.assignments, "award", "awards")} and {result.forms} forms now exist in {to}. Saved in one transaction.
          </p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {tiles.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[13px] font-semibold text-muted">{label}</dt>
                <dd className="num mt-1 text-xl font-bold">{value}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={`${to} reporting periods`} description="Reminder rules for these periods can be set up next." actions={<Link href="/finance/reminders" className="text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover">Open reminders</Link>} />
        <Table>
          <THead>
            <tr>
              <TH>Period</TH>
              <TH>Name</TH>
              <TH>Due</TH>
            </tr>
          </THead>
          <tbody>
            {result.periods.map((p) => (
              <TR key={p.id}>
                <TD className="whitespace-nowrap font-mono text-[13px] font-semibold">{p.id}</TD>
                <TD>{p.label}</TD>
                <TD className="whitespace-nowrap">{formatDate(p.due_on)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
