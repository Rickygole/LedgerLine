import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { reportState } from "@/lib/reporting";
import { formatCurrency } from "@/lib/rules/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody, DescriptionList } from "@/components/ui/card";
import { Badge, StateBadge } from "@/components/ui/status-badge";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { CreateDraftForm } from "@/components/finance/admin/create-draft-form";
import { loadInitiative } from "@/lib/finance/admin/initiatives";
import { isUuid } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Initiative" };

const FORM_TONE = { published: "ok", draft: "warn", superseded: "neutral" } as const;
const SOURCE_LABEL: Record<string, string> = { seed: "Seed", manual: "Manual", ai_draft: "AI draft", rule_draft: "Rule draft" };

export default async function InitiativeDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(FINANCE_ROLES);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await withClaims(user.id, (tx) => loadInitiative(tx, id));
  if (!data) notFound();
  const { initiative, funded, forms, due } = data;
  const hasDraft = forms.some((f) => f.status === "draft");
  const hasSource = forms.some((f) => f.status !== "draft");

  return (
    <>
      <PageHeader
        title={initiative.name}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Initiatives", href: "/finance/initiatives" }, { label: initiative.code }]}
        meta={
          <>
            <span className="font-mono text-xs text-muted">{initiative.code}</span>
            <Badge tone="info">{initiative.category}</Badge>
            <Badge tone={initiative.status === "active" ? "ok" : "neutral"}>{initiative.status === "active" ? "Active" : "Retired"}</Badge>
          </>
        }
      />

      <Card className="mb-6">
        <CardBody>
          <DescriptionList
            columns={3}
            items={[
              { label: "Code", value: <span className="font-mono">{initiative.code}</span> },
              { label: "Fiscal year", value: initiative.fiscal_year_id },
              { label: "Total funding", value: <span className="num">{formatCurrency(Number(initiative.total_funding))}</span> },
            ]}
          />
          <p className="mt-5 max-w-3xl text-sm leading-relaxed">{initiative.description}</p>
        </CardBody>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Funded organizations" description={`${funded.length} ${funded.length === 1 ? "organization" : "organizations"} receive funding through this initiative.`} />
        <Table>
          <THead>
            <tr>
              <TH>Organization</TH>
              <TH>EIN</TH>
              <TH>Borough</TH>
              <TH align="right">Award</TH>
              <TH>Sponsoring agency</TH>
              <TH>FY26 Year-End</TH>
              <TH>FY27 Mid-Year</TH>
            </tr>
          </THead>
          <tbody>
            {funded.length === 0 ? (
              <EmptyRow colSpan={7}>No organizations are assigned yet.</EmptyRow>
            ) : (
              funded.map((f) => (
                <TR key={f.assignment_id}>
                  <TD>
                    <Link href={`/finance/organizations/${f.org_id}`} className="font-semibold text-navy-800 hover:underline">
                      {f.legal_name}
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs">{f.ein}</TD>
                  <TD>{f.borough}</TD>
                  <TD align="right">{formatCurrency(Number(f.award_amount))}</TD>
                  <TD>{f.sponsoring_agency ?? <span className="text-muted">Not recorded</span>}</TD>
                  <TD>
                    <StateBadge state={reportState(f.ye_status, due["FY26-YE"])} />
                  </TD>
                  <TD>
                    <StateBadge state={reportState(f.mid_status, due["FY27-MY"])} />
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Report form"
          description="Each version is frozen once published. Edit a draft, then publish it to replace the current version."
          actions={user.role === "finance_admin" && !hasDraft && hasSource ? <CreateDraftForm initiativeId={initiative.id} /> : null}
        />
        <Table>
          <THead>
            <tr>
              <TH align="right">Version</TH>
              <TH>Status</TH>
              <TH>Source</TH>
              <TH>Created</TH>
              <TH>Published by</TH>
              <TH>Published at</TH>
              <TH>
                <span className="sr-only">Open</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {forms.length === 0 ? (
              <EmptyRow colSpan={7}>No form versions exist for this initiative.</EmptyRow>
            ) : (
              forms.map((f) => (
                <TR key={f.id}>
                  <TD align="right">v{f.version}</TD>
                  <TD>
                    <Badge tone={FORM_TONE[f.status]}>{f.status === "published" ? "Published" : f.status === "draft" ? "Draft" : "Superseded"}</Badge>
                  </TD>
                  <TD>{SOURCE_LABEL[f.source] ?? f.source}</TD>
                  <TD>
                    {formatDateTime(f.created_at)}
                    {f.created_by_name ? <div className="text-xs text-muted">{f.created_by_name}</div> : null}
                  </TD>
                  <TD>{f.published_by_name ?? <span className="text-muted">Not published</span>}</TD>
                  <TD>{f.published_at ? formatDateTime(f.published_at) : <span className="text-muted">Not published</span>}</TD>
                  <TD>
                    <Link href={`/finance/forms/${f.id}`} className="font-semibold text-navy-800 hover:underline">
                      {f.status === "draft" ? "Edit" : "View"}
                      <span className="sr-only"> version {f.version}</span>
                    </Link>
                  </TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
