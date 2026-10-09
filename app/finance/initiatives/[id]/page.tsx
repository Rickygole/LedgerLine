import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { formatCurrency } from "@/lib/rules/money";
import { ProfileHeader } from "@/components/ui/profile-header";
import { PrintButton } from "@/components/ui/print-button";
import { InitiativeLineage } from "@/components/finance/lifecycle/lineage-note";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { AwardPeriods, ContractCell, SponsorsCell } from "@/components/finance/admin/award-cells";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { CreateDraftForm } from "@/components/finance/admin/create-draft-form";
import { loadInitiative } from "@/lib/finance/admin/initiatives";
import { isUuid } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Initiative" };

const FORM_TONE = { published: "ok", draft: "warn", superseded: "neutral" } as const;
const SOURCE_LABEL: Record<string, string> = { seed: "Imported", manual: "Manual", ai_draft: "AI draft", rule_draft: "Rule draft" };

export default async function InitiativeDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(FINANCE_ROLES);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await withClaims(user.id, (tx) => loadInitiative(tx, id));
  if (!data) notFound();
  const { initiative, funded, forms } = data;
  const hasDraft = forms.some((f) => f.status === "draft");
  const hasSource = forms.some((f) => f.status !== "draft");

  return (
    <>
      <InitiativeLineage initiativeId={id} />
      <ProfileHeader
        title={initiative.name}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Initiatives", href: "/finance/initiatives" }, { label: initiative.code }]}
        meta={[
          <span key="code" className="whitespace-nowrap font-mono text-[13px]">{initiative.code}</span>,
          <Badge key="category" tone="info">{initiative.category}</Badge>,
          <Badge key="status" tone={initiative.status === "active" ? "ok" : "neutral"}>{initiative.status === "active" ? "Active" : "Retired"}</Badge>,
          <span key="fy" className="whitespace-nowrap">{initiative.fiscal_year_id}</span>,
          <span key="agency" className="whitespace-nowrap">{initiative.administering_agency ? `Administered by ${initiative.administering_agency}` : "No administering agency"}</span>,
        ]}
        actions={<PrintButton label="Print" />}
      >
        <div className="grid gap-5 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <p className="max-w-[72ch] text-sm leading-relaxed text-ink">{initiative.description}</p>
          <dl className="grid grid-cols-2 gap-4 lg:border-l lg:border-line lg:pl-6">
            <div>
              <dt className="text-[13px] font-semibold text-muted">Total funding</dt>
              <dd className="num mt-1 text-lg font-bold text-ink">{formatCurrency(Number(initiative.total_funding))}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-muted">Organizations</dt>
              <dd className="num mt-1 text-lg font-bold text-ink">{funded.length}</dd>
            </div>
          </dl>
        </div>
      </ProfileHeader>

      <Card className="mb-6">
        <CardHeader title="Funded organizations" description={`${funded.length} ${funded.length === 1 ? "organization" : "organizations"} receive funding through this initiative.`} />
        <Table>
          <THead>
            <tr>
              <TH>Organization</TH>
              <TH>EIN</TH>
              <TH>Borough</TH>
              <TH align="right">Award</TH>
              <TH>Funding and sponsor</TH>
              <TH>Agency</TH>
              <TH>Contract</TH>
              <TH>Reports</TH>
            </tr>
          </THead>
          <tbody>
            {funded.length === 0 ? (
              <EmptyRow colSpan={8}>No organizations are assigned yet.</EmptyRow>
            ) : (
              funded.map((f) => (
                <TR key={f.assignment_id}>
                  <TD>
                    <Link href={`/finance/organizations/${f.org_id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      {f.legal_name}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap font-mono text-[13px] text-muted">{f.ein}</TD>
                  <TD>{f.borough}</TD>
                  <TD align="right">{formatCurrency(Number(f.award_amount))}</TD>
                  <TD>
                    <SponsorsCell sponsors={f.sponsors} source={f.funding_source} />
                  </TD>
                  <TD>{f.sponsoring_agency ?? <span className="text-muted">Not recorded</span>}</TD>
                  <TD>
                    <ContractCell status={f.contract_status} number={f.contract_number} registeredOn={f.contract_registered_on} />
                  </TD>
                  <TD>
                    <AwardPeriods periods={f.periods} />
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
                    {formatDateTime(f.published_at && new Date(f.published_at) < new Date(f.created_at) ? f.published_at : f.created_at)}
                    {f.created_by_name ? <div className="text-xs text-muted">{f.created_by_name}</div> : null}
                  </TD>
                  <TD>{f.published_by_name ?? <span className="text-muted">Not published</span>}</TD>
                  <TD>{f.published_at ? formatDateTime(f.published_at) : <span className="text-muted">Not published</span>}</TD>
                  <TD>
                    <Link href={`/finance/forms/${f.id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
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
