import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Info, MapPin, Phone, Send, Star } from "lucide-react";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { ProfileHeader } from "@/components/ui/profile-header";
import { TabNav } from "@/components/finance/admin/tab-nav";
import { Stat } from "@/components/ui/stat";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser, roleLabel, type Role } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatCurrency } from "@/lib/rules/money";
import { ContractCell } from "@/components/finance/admin/award-cells";
import { todayInNewYork } from "@/lib/dates";
import { currentFiscalYear, loadObligations, loadOrganization } from "@/lib/portal/data";
import { orgTypeLabel } from "@/lib/finance/admin/sql";

export const metadata: Metadata = { title: "Organization profile" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contact = { id: string; full_name: string; title: string; email: string; phone: string | null; is_primary: boolean };
type Member = { id: string; full_name: string; title: string | null; email: string; role: Role };
type Funded = { assignment_id: string; fiscal_year_id: string; code: string; name: string; category: string; sponsoring_agency: string | null; award_amount: string; contract_status: string; contract_number: string | null; contract_registered_on: string | null; reports_on_file: number };

const TABS = ["overview", "people", "initiatives"] as const;

export default async function OrganizationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireUser(["cbo_submitter"]);
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t === requested) ?? "overview";
  const data = await withClaims(user.id, async (tx) => ({
    org: await loadOrganization(tx, user.orgId!),
    contacts: await tx.query<Contact>(`SELECT id, full_name, title, email, phone, is_primary FROM contact WHERE org_id = $1 ORDER BY is_primary DESC, full_name`, [user.orgId]),
    members: await tx.query<Member>(`SELECT id, full_name, title, email, role FROM app_user WHERE org_id = $1 AND active ORDER BY full_name`, [user.orgId]),
    funded: await tx.query<Funded>(
      `SELECT a.id AS assignment_id, i.fiscal_year_id, i.code, i.name, i.category, a.sponsoring_agency, a.award_amount::text AS award_amount,
              a.contract_status, a.contract_number, a.contract_registered_on::text AS contract_registered_on,
              (SELECT count(*)::int FROM submission s WHERE s.assignment_id = a.id AND s.submitted_at IS NOT NULL) AS reports_on_file
       FROM assignment a JOIN initiative i ON i.id = a.initiative_id
       WHERE a.org_id = $1 ORDER BY i.fiscal_year_id DESC, i.name`,
      [user.orgId],
    ),
    obligations: await loadObligations(tx, user.orgId!),
    fiscalYear: await currentFiscalYear(tx, todayInNewYork()),
  }));
  if (!data.org) notFound();
  const { org, contacts, members, funded, obligations, fiscalYear } = data;
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
  const totalAward = funded.filter((f) => f.fiscal_year_id === fiscalYear).reduce((sum, f) => sum + Number(f.award_amount), 0);
  const totalReports = funded.reduce((sum, f) => sum + f.reports_on_file, 0);
  const accepted = obligations.filter((o) => o.status === "accepted").length;
  const submitted = obligations.filter((o) => o.status === "submitted" || o.status === "under_review").length;
  const overdue = obligations.filter((o) => o.state === "missing").length;
  const outstanding = obligations.filter((o) => o.status === null || o.status === "draft" || o.status === "returned").length;

  return (
    <>
      <ProfileHeader
        title={org.legalName}
        subtitle={org.dbaName ? `Doing business as ${org.dbaName}` : undefined}
        crumbs={[{ label: "Portal", href: "/portal" }, { label: "Organization profile" }]}
        meta={[
          <Badge key="type" tone="info">
            {orgTypeLabel(org.orgType)}
          </Badge>,
          <span key="ein" className="whitespace-nowrap font-mono text-[13px]">
            EIN {org.ein}
          </span>,
          <span key="area" className="whitespace-nowrap">
            {org.borough}
            {org.councilDistrict ? `, District ${org.councilDistrict}` : ""}
          </span>,
          org.foundedYear ? (
            <span key="founded" className="num whitespace-nowrap">
              Founded {org.foundedYear}
            </span>
          ) : null,
          <span key="update" className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            To update organization details, contact Council Finance.
          </span>,
        ]}
        tabs={
          <TabNav
            attached
            base="/portal/organization"
            label="Organization sections"
            current={tab}
            tabs={[
              { key: "overview", label: "Overview" },
              { key: "people", label: "Contacts and team", count: contacts.length + members.length },
              { key: "initiatives", label: "Funded initiatives", count: funded.length },
            ]}
          />
        }
      />

      {tab === "overview" ? (
        <>
          <section aria-labelledby="compliance" className="mb-6">
            <h2 id="compliance" className="sr-only">
              Compliance at a glance
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Stat label="Reports accepted" value={accepted} tone="ok" hint="Accepted by Council Finance" icon={CheckCircle2} />
              <Stat label="Submitted or in review" value={submitted} tone="info" hint="Waiting on Council Finance" icon={Send} />
              <Stat label="Outstanding" value={outstanding} hint="Not yet submitted" tone={outstanding > 0 ? "warn" : "neutral"} icon={Clock} />
              <Stat label="Overdue" value={overdue} hint="Past the due date" tone={overdue > 0 ? "bad" : "neutral"} icon={AlertTriangle} />
            </div>
          </section>
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="About" />
              <CardBody>
                <h3 className="text-[13px] font-semibold text-muted">Mission</h3>
                <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-ink">{org.mission ?? "No mission statement on file."}</p>
                <div className="mt-5 border-t border-line pt-5">
                  <DescriptionList
                    columns={3}
                    items={[
                      { label: "Legal name", value: org.legalName },
                      { label: "EIN", value: <span className="whitespace-nowrap font-mono text-[13px]">{org.ein}</span> },
                      { label: "Organization type", value: orgTypeLabel(org.orgType) },
                      { label: "Borough", value: org.borough },
                      { label: "Council district", value: org.councilDistrict ? `District ${org.councilDistrict}` : null },
                      { label: "Founded", value: org.foundedYear ? <span className="num">{org.foundedYear}</span> : null },
                      { label: "Annual budget", value: org.annualBudget !== null ? <span className="num">{formatCurrency(org.annualBudget)}</span> : null },
                      { label: `Total awarded, ${fiscalYear}`, value: <span className="num">{formatCurrency(totalAward)}</span> },
                      { label: "Reports on file", value: <span className="num">{totalReports}</span> },
                    ]}
                  />
                </div>
              </CardBody>
            </Card>
            <Card className="self-start">
              <CardHeader title="Contact" />
              <ul className="space-y-3 px-5 py-4 text-sm">
                <li className="flex gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <span>{org.address}</span>
                </li>
                <li className="flex gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="num">{org.phone ?? "No phone on file"}</span>
                </li>
                <li className="flex gap-2.5">
                  <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="break-all">{org.website ?? "No website on file"}</span>
                </li>
              </ul>
              <div className="border-t border-line px-5 py-4">
                <h3 className="text-[13px] font-semibold text-muted">Primary contact</h3>
                {primary ? (
                  <div className="mt-2">
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-ink">{primary.full_name}</p>
                      <p className="text-muted">{primary.title}</p>
                      <p className="mt-1 break-all">{primary.email}</p>
                      {primary.phone ? <p className="num text-muted">{primary.phone}</p> : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">No primary contact on file.</p>
                )}
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {tab === "people" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Contacts" description="People Council Finance may contact about reports." />
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Email and phone</TH>
                </tr>
              </THead>
              <tbody>
                {contacts.length === 0 ? (
                  <EmptyRow colSpan={2}>No contacts on file.</EmptyRow>
                ) : (
                  contacts.map((c) => (
                    <TR key={c.id}>
                      <TD>
                        <p className="flex items-center gap-2 font-medium text-ink">
                          {c.full_name}
                          {c.is_primary ? (
                            <Badge tone="ok" icon={Star}>
                              Primary
                            </Badge>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted">{c.title}</p>
                      </TD>
                      <TD>
                        <p>{c.email}</p>
                        <p className="text-xs text-muted">{c.phone ?? "No phone on file"}</p>
                      </TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Team members" description="People who can sign in and report for this organization." />
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Role</TH>
                </tr>
              </THead>
              <tbody>
                {members.length === 0 ? (
                  <EmptyRow colSpan={2}>No team members found.</EmptyRow>
                ) : (
                  members.map((m) => (
                    <TR key={m.id}>
                      <TD>
                        <p className="font-medium text-ink">
                          {m.full_name}
                          {m.id === user.id ? <span className="ml-2 text-xs font-normal text-muted">You</span> : null}
                        </p>
                        <p className="text-xs text-muted">
                          {m.title ?? "No title"}, {m.email}
                        </p>
                      </TD>
                      <TD>{roleLabel(m.role)}</TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
        </div>
      ) : null}

      {tab === "initiatives" ? (
        <Card>
          <CardHeader title="Funded initiatives" description="Council initiatives awarded to this organization." />
          <Table>
            <THead>
              <tr>
                <TH>Initiative</TH>
                <TH>Year</TH>
                <TH>Administering agency</TH>
                <TH>Contract</TH>
                <TH align="right">Award</TH>
                <TH align="right">Reports on file</TH>
              </tr>
            </THead>
            <tbody>
              {funded.length === 0 ? (
                <EmptyRow colSpan={6}>No initiatives are assigned to this organization yet.</EmptyRow>
              ) : (
                funded.map((f) => (
                  <TR key={f.assignment_id}>
                    <TD>
                      <p className="font-medium text-ink">{f.name}</p>
                      <p className="font-mono text-[13px] text-muted">{f.code}</p>
                    </TD>
                    <TD className="whitespace-nowrap">{f.fiscal_year_id}</TD>
                    <TD>{f.sponsoring_agency ?? <span className="text-muted">Not provided</span>}</TD>
                    <TD>
                      <ContractCell status={f.contract_status} number={f.contract_number} registeredOn={f.contract_registered_on} />
                    </TD>
                    <TD align="right">{formatCurrency(Number(f.award_amount))}</TD>
                    <TD align="right">{f.reports_on_file}</TD>
                  </TR>
                ))
              )}
            </tbody>
            {funded.length > 0 ? (
              <tfoot>
                <tr className="border-t border-line bg-surface/70 font-semibold">
                  <td className="px-4 py-3" colSpan={4}>
                    Total, {fiscalYear}
                  </td>
                  <td className="num px-4 py-3 text-right">{formatCurrency(totalAward)}</td>
                  <td className="num px-4 py-3 text-right">{totalReports}</td>
                </tr>
              </tfoot>
            ) : null}
          </Table>
        </Card>
      ) : null}
    </>
  );
}
