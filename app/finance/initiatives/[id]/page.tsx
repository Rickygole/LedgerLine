import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { formatCurrency, plural } from "@/lib/format";
import { ProfileHeader } from "@/components/ui/profile-header";
import { PrintButton } from "@/components/ui/print-button";
import { lineageMeta } from "@/components/finance/lifecycle/lineage-note";
import { lineageFor } from "@/lib/lifecycle/rollover";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { AwardPeriods, ContractCell, SponsorsCell } from "@/components/finance/admin/award-cells";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { CreateDraftForm } from "@/components/finance/admin/create-draft-form";
import { FormStartChoice } from "@/components/finance/admin/form-start-choice";
import { MiniDistrictMap } from "@/components/finance/map/mini-district-map";
import { buttonClass } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { loadInitiative } from "@/lib/finance/admin/initiatives";
import { isUuid } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Initiative" };

const FORM_TONE = { published: "ok", draft: "neutral", superseded: "neutral" } as const;
const SOURCE_LABEL: Record<string, string> = { seed: "Imported", manual: "Manual", ai_draft: "Imported from Word, AI draft", rule_draft: "Imported from Word" };

export default async function InitiativeDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(FINANCE_ROLES);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await withClaims(user.id, async (tx) => {
    const loaded = await loadInitiative(tx, id);
    if (!loaded) return null;
    return { ...loaded, lineage: await lineageFor(tx, id) };
  });
  if (!data) notFound();
  const { initiative, funded, forms, lineage } = data;
  const hasDraft = forms.some((f) => f.status === "draft");
  const hasSource = forms.some((f) => f.status !== "draft");
  const published = forms.some((f) => f.status === "published");
  const draft = forms.find((f) => f.status === "draft");
  const admin = user.role === "finance_admin";
  const perDistrict = new Map<number, number>();
  for (const f of funded) if (f.council_district) perDistrict.set(f.council_district, (perDistrict.get(f.council_district) ?? 0) + 1);
  const fills = Object.fromEntries([...perDistrict.entries()].map(([d, n]) => [d, n >= 3 ? "#173962" : n === 2 ? "#2b64a8" : "#9db8dc"]));
  const districtList = [...perDistrict.keys()].sort((a, b) => a - b);
  const mapCaption = districtList.length === 0 ? "No funded organizations have a Council district on file." : `Funded organizations are located in ${plural(districtList.length, "District", "Districts")} ${districtList.join(", ")}.`;

  return (
    <>
      <ProfileHeader
        title={initiative.name}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Initiatives", href: "/finance/initiatives" }, { label: initiative.code }]}
        meta={[
          <span key="code" className="whitespace-nowrap font-mono text-[13px]">{initiative.code}</span>,
          <Badge key="category">{initiative.category}</Badge>,
          <Badge key="status" tone={initiative.status === "active" ? "ok" : "neutral"} icon={initiative.status === "active" ? CheckCircle2 : undefined}>{initiative.status === "active" ? "Active" : "Retired"}</Badge>,
          <span key="fy" className="whitespace-nowrap">{initiative.fiscal_year_id}</span>,
          <span key="agency" className="whitespace-nowrap">{initiative.administering_agency ? `Administered by ${initiative.administering_agency}` : "No administering agency"}</span>,
          ...lineageMeta(lineage),
        ]}
        actions={<PrintButton label="Print" />}
      >
        <div className="grid gap-5 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_200px]">
          <p className="max-w-[72ch] text-[15px] leading-relaxed text-ink">{initiative.description}</p>
          <dl className="grid grid-cols-2 content-start gap-4 lg:border-l lg:border-line lg:pl-6">
            <div>
              <dt className="text-[13px] font-semibold text-muted">Total funding</dt>
              <dd className="num mt-1 text-lg font-bold text-ink">{formatCurrency(Number(initiative.total_funding), { cents: false })}</dd>
            </div>
            <div>
              <dt className="text-[13px] font-semibold text-muted">Organizations</dt>
              <dd className="num mt-1 text-lg font-bold text-ink">{funded.length}</dd>
            </div>
          </dl>
          <figure>
            <p className="text-[13px] font-semibold text-muted">Where funded organizations are</p>
            <MiniDistrictMap fills={fills} label={`Map of Council districts. ${mapCaption}`} className="mt-1 block h-auto w-[200px] max-w-full" />
            <figcaption className="mt-1 text-[13px] leading-5 text-muted">{mapCaption} Darker means more organizations.</figcaption>
          </figure>
        </div>
      </ProfileHeader>

      <Card className="mb-6">
        <CardHeader title="Funded organizations" description={`${funded.length} ${plural(funded.length, "organization receives", "organizations receive")} funding through this initiative.`} />
        <Table density="compact">
          <THead>
            <tr>
              <TH>Organization</TH>
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
              <EmptyRow colSpan={7}>No organizations are assigned yet.</EmptyRow>
            ) : (
              funded.map((f) => (
                <TR key={f.assignment_id}>
                  <TD className="min-w-[12rem]">
                    <Link href={`/finance/organizations/${f.org_id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                      {f.legal_name}
                    </Link>
                    <span className="block font-mono text-[13px] text-muted">{f.ein}</span>
                  </TD>
                  <TD>
                    {f.borough}
                    {f.council_district ? <span className="block text-[13px] text-muted">District {f.council_district}</span> : null}
                  </TD>
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

      {!published ? (
        <section aria-labelledby="no-form-title" className="mb-6 rounded border border-line bg-white px-5 py-6 sm:px-6">
          <FileText className="h-6 w-6 text-ink-2" aria-hidden="true" />
          <h2 id="no-form-title" className="mt-2 text-xl font-bold leading-7 text-ink">
            This initiative has no report form yet.
          </h2>
          <p className="mt-1 max-w-[70ch] text-[15px] leading-[22px] text-ink-2">
            Funded organizations cannot report until a form is published. Import the Word template the Council has used so far, or start from the standard questions every initiative shares.
          </p>
          <div className="mt-4">
            {!admin ? (
              <p className="text-[15px] text-muted">A Finance administrator can build the form.</p>
            ) : draft ? (
              <div className="flex flex-wrap items-center gap-3">
                <a href={`/finance/forms/${draft.id}?import=1`} className={buttonClass("primary", "md", "h-11 px-5 text-base")}>
                  Import a Word template
                </a>
                <a href={`/finance/forms/${draft.id}`} className={buttonClass("secondary", "md", "h-11 px-5 text-base")}>
                  Continue the draft (version {draft.version})
                </a>
              </div>
            ) : (
              <FormStartChoice initiativeId={initiative.id} />
            )}
          </div>
        </section>
      ) : null}

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
