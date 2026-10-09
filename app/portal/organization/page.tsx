import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Info, Star } from "lucide-react";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Stat } from "@/components/ui/stat";
import { EmptyRow, Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser, roleLabel, type Role } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatCurrency } from "@/lib/rules/money";
import { loadObligations, loadOrganization, orgTypeLabel } from "@/lib/portal/data";

export const metadata: Metadata = { title: "Organization profile" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contact = { id: string; full_name: string; title: string; email: string; phone: string | null; is_primary: boolean };
type Member = { id: string; full_name: string; title: string | null; email: string; role: Role };
type Funded = { assignment_id: string; code: string; name: string; category: string; sponsoring_agency: string | null; award_amount: string; reports_on_file: number };

export default async function OrganizationPage() {
  const user = await requireUser(["cbo_submitter"]);
  const data = await withClaims(user.id, async (tx) => ({
    org: await loadOrganization(tx, user.orgId!),
    contacts: await tx.query<Contact>(`SELECT id, full_name, title, email, phone, is_primary FROM contact WHERE org_id = $1 ORDER BY is_primary DESC, full_name`, [user.orgId]),
    members: await tx.query<Member>(`SELECT id, full_name, title, email, role FROM app_user WHERE org_id = $1 AND active ORDER BY full_name`, [user.orgId]),
    funded: await tx.query<Funded>(
      `SELECT a.id AS assignment_id, i.code, i.name, i.category, a.sponsoring_agency, a.award_amount::text AS award_amount,
              (SELECT count(*)::int FROM submission s WHERE s.assignment_id = a.id AND s.submitted_at IS NOT NULL) AS reports_on_file
       FROM assignment a JOIN initiative i ON i.id = a.initiative_id
       WHERE a.org_id = $1 ORDER BY i.name`,
      [user.orgId]
    ),
    obligations: await loadObligations(tx, user.orgId!),
  }));
  if (!data.org) notFound();
  const { org, contacts, members, funded, obligations } = data;
  const totalAward = funded.reduce((sum, f) => sum + Number(f.award_amount), 0);
  const totalReports = funded.reduce((sum, f) => sum + f.reports_on_file, 0);
  const accepted = obligations.filter((o) => o.status === "accepted").length;
  const submitted = obligations.filter((o) => o.status === "submitted" || o.status === "under_review").length;
  const overdue = obligations.filter((o) => o.state === "missing").length;
  const outstanding = obligations.filter((o) => o.status === null || o.status === "draft" || o.status === "returned").length;

  return (
    <>
      <PageHeader title="Organization profile" crumbs={[{ label: "Portal", href: "/portal" }, { label: "Organization" }]} />

      <Card className="mb-6">
        <CardHeader
          title={org.legalName}
          description={org.dbaName ? `Doing business as ${org.dbaName}` : undefined}
          actions={<Badge tone="info">{orgTypeLabel(org.orgType)}</Badge>}
        />
        <CardBody>
          <DescriptionList
            columns={3}
            items={[
              { label: "EIN", value: <span className="font-mono">{org.ein}</span> },
              { label: "Borough", value: org.borough },
              { label: "Council district", value: org.councilDistrict ? `District ${org.councilDistrict}` : null },
              { label: "Address", value: org.address },
              { label: "Phone", value: org.phone },
              { label: "Website", value: org.website },
              { label: "Founded", value: org.foundedYear ? <span className="num">{org.foundedYear}</span> : null },
              { label: "Annual budget", value: org.annualBudget !== null ? <span className="num">{formatCurrency(org.annualBudget)}</span> : null },
              { label: "Organization type", value: orgTypeLabel(org.orgType) },
            ]}
          />
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Mission</p>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-ink">{org.mission ?? "No mission statement on file."}</p>
          </div>
          <p className="mt-5 flex items-center gap-2 rounded-md bg-info-bg px-3 py-2 text-sm text-info">
            <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
            To update organization details, contact Council Finance.
          </p>
        </CardBody>
      </Card>

      <section aria-labelledby="compliance" className="mb-6">
        <h2 id="compliance" className="mb-3 text-base font-semibold text-ink">Compliance summary</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Reports accepted" value={accepted} tone="ok" />
          <Stat label="Submitted or in review" value={submitted} tone="info" />
          <Stat label="Outstanding" value={outstanding} hint="Not yet submitted" tone={outstanding > 0 ? "warn" : "neutral"} />
          <Stat label="Overdue" value={overdue} hint="Past the due date" tone={overdue > 0 ? "bad" : "neutral"} />
        </div>
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
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
                      <p className="text-xs text-muted">{m.title ?? "No title"}, {m.email}</p>
                    </TD>
                    <TD>{roleLabel(m.role)}</TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card>
        <CardHeader title="Funded initiatives" description="Council initiatives awarded to this organization." />
        <Table>
          <THead>
            <tr>
              <TH>Initiative</TH>
              <TH>Category</TH>
              <TH>Sponsoring agency</TH>
              <TH align="right">Award</TH>
              <TH align="right">Reports on file</TH>
            </tr>
          </THead>
          <tbody>
            {funded.length === 0 ? (
              <EmptyRow colSpan={5}>No initiatives are assigned to this organization yet.</EmptyRow>
            ) : (
              funded.map((f) => (
                <TR key={f.assignment_id}>
                  <TD>
                    <p className="font-medium text-ink">{f.name}</p>
                    <p className="num text-xs text-muted">{f.code}</p>
                  </TD>
                  <TD>{f.category}</TD>
                  <TD>{f.sponsoring_agency ?? <span className="text-muted">Not provided</span>}</TD>
                  <TD align="right">{formatCurrency(Number(f.award_amount))}</TD>
                  <TD align="right">{f.reports_on_file}</TD>
                </TR>
              ))
            )}
          </tbody>
          {funded.length > 0 ? (
            <tfoot>
              <tr className="border-t border-line bg-surface/70 font-semibold">
                <td className="px-4 py-3" colSpan={3}>
                  Total
                </td>
                <td className="num px-4 py-3 text-right">{formatCurrency(totalAward)}</td>
                <td className="num px-4 py-3 text-right">{totalReports}</td>
              </tr>
            </tfoot>
          ) : null}
        </Table>
      </Card>
    </>
  );
}
