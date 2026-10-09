import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ExternalLink, Mail, MapPin, Phone, Star } from "lucide-react";
import { FINANCE_ROLES, requireUser, roleLabel, type Role } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { daysPastDue, formatDate, formatDateTime } from "@/lib/dates";
import { reportState } from "@/lib/reporting";
import { expectedState } from "@/lib/finance/admin/state";
import { formatCurrency } from "@/lib/rules/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { Badge, StateBadge } from "@/components/ui/status-badge";
import { Stat } from "@/components/ui/stat";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { TabNav } from "@/components/finance/admin/tab-nav";
import { AuditSentence } from "@/components/finance/admin/audit-line";
import { loadOrganization } from "@/lib/finance/admin/organizations";
import { orgActivity } from "@/lib/finance/admin/audit";
import { orgTypeLabel } from "@/lib/finance/admin/sql";
import { isUuid, one, pickOne, type SearchParams } from "@/lib/finance/admin/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organization profile" };

const TABS = ["awards", "reports", "contacts", "activity", "messages"] as const;

export default async function OrganizationProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const tab = pickOne(one(await searchParams, "tab"), TABS, "awards");

  const data = await withClaims(user.id, async (tx) => {
    const loaded = await loadOrganization(tx, id);
    if (!loaded) return null;
    const activity = tab === "activity" ? await orgActivity(tx, id) : [];
    return { ...loaded, activity };
  });
  if (!data) notFound();
  const { org, awards, reports, periods, contacts, team, messages, activity } = data;
  const due = Object.fromEntries(periods.map((p) => [p.id, p.due_on]));

  const active = awards.filter((a) => a.initiative_status === "active");
  const totalAwarded = active.reduce((sum, a) => sum + Number(a.award_amount), 0);
  const accepted = reports.filter((r) => r.status === "accepted").length;
  const overdue = active.filter((a) => expectedState(a.ye_status, due["FY26-YE"], a.published) === "missing").length;
  const address = `${org.address_line}, ${org.city}, ${org.state} ${org.postal_code}`;

  return (
    <>
      <PageHeader
        title={org.legal_name}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Organizations", href: "/finance/organizations" }, { label: org.legal_name }]}
        meta={
          <>
            <Badge tone="info">{orgTypeLabel(org.org_type)}</Badge>
            <span className="font-mono text-xs text-muted">EIN {org.ein}</span>
          </>
        }
      />

      <Card className="mb-6">
        <CardBody className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Mission</h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink">{org.mission ?? "No mission statement on file."}</p>
            <div className="mt-5">
              <DescriptionList
                columns={3}
                items={[
                  { label: "Legal name", value: org.legal_name },
                  { label: "Borough", value: org.borough },
                  { label: "Council district", value: org.council_district ? <span className="num">{org.council_district}</span> : null },
                  { label: "Founded", value: org.founded_year ? <span className="num">{org.founded_year}</span> : null },
                  { label: "Annual budget", value: org.annual_budget ? <span className="num">{formatCurrency(Number(org.annual_budget))}</span> : null },
                  { label: "Also known as", value: org.dba_name },
                ]}
              />
            </div>
          </div>
          <ul className="space-y-3 rounded-md bg-surface/70 p-4 text-sm">
            <li className="flex gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span>{address}</span>
            </li>
            <li className="flex gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="num">{org.phone ?? "No phone on file"}</span>
            </li>
            <li className="flex gap-2">
              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="break-all">{org.website ?? "No website on file"}</span>
            </li>
          </ul>
        </CardBody>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total awarded" value={formatCurrency(totalAwarded)} hint="Active initiatives" />
        <Stat label="Active initiatives" value={active.length} />
        <Stat label="Reports accepted" value={accepted} tone="ok" hint={`${reports.length} submitted or started`} />
        <Stat label="Overdue" value={overdue} tone={overdue > 0 ? "bad" : "neutral"} hint="FY26 Year-End" />
      </div>

      <TabNav
        base={`/finance/organizations/${id}`}
        label="Organization sections"
        current={tab}
        tabs={[
          { key: "awards", label: "Awards", count: awards.length },
          { key: "reports", label: "Reports", count: reports.length },
          { key: "contacts", label: "Contacts and team", count: contacts.length + team.length },
          { key: "activity", label: "Activity" },
          { key: "messages", label: "Messages", count: messages.length },
        ]}
      />

      {tab === "awards" ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Initiative</TH>
                <TH>Category</TH>
                <TH>Sponsoring agency</TH>
                <TH align="right">Award</TH>
                <TH>FY26 Year-End</TH>
                <TH>FY27 Mid-Year</TH>
              </tr>
            </THead>
            <tbody>
              {awards.length === 0 ? (
                <EmptyRow colSpan={6}>This organization has no awards yet.</EmptyRow>
              ) : (
                awards.map((a) => (
                  <TR key={a.assignment_id}>
                    <TD>
                      <Link href={`/finance/initiatives/${a.initiative_id}`} className="font-semibold text-navy-800 hover:underline">
                        {a.name}
                      </Link>
                      <div className="font-mono text-xs text-muted">{a.code}</div>
                    </TD>
                    <TD>{a.category}</TD>
                    <TD>{a.sponsoring_agency ?? <span className="text-muted">Not recorded</span>}</TD>
                    <TD align="right">{formatCurrency(Number(a.award_amount))}</TD>
                    <TD>
                      <StateBadge state={expectedState(a.ye_status, due["FY26-YE"], a.published)} />
                    </TD>
                    <TD>
                      <StateBadge state={expectedState(a.mid_status, due["FY27-MY"], a.published)} />
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "reports" ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Reference</TH>
                <TH>Initiative</TH>
                <TH>Period</TH>
                <TH>Status</TH>
                <TH align="right">Revision</TH>
                <TH>Submitted by</TH>
                <TH>Submitted at</TH>
              </tr>
            </THead>
            <tbody>
              {reports.length === 0 ? (
                <EmptyRow colSpan={7}>No reports have been started for this organization.</EmptyRow>
              ) : (
                reports.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Link href={`/finance/submissions/${r.id}`} className="font-mono text-xs font-semibold text-navy-800 hover:underline">
                        {r.reference_no}
                      </Link>
                    </TD>
                    <TD>{r.initiative_name}</TD>
                    <TD>
                      {r.period_label}
                      <div className="text-xs text-muted">Due {formatDate(r.due_on)}</div>
                    </TD>
                    <TD>
                      <StateBadge state={reportState(r.status, r.due_on)} />
                      {r.status === "draft" && daysPastDue(r.due_on) > 0 ? <span className="sr-only"> past due</span> : null}
                    </TD>
                    <TD align="right">{r.revision}</TD>
                    <TD>{r.submitted_by_name ?? <span className="text-muted">Not submitted</span>}</TD>
                    <TD>{r.submitted_at ? formatDateTime(r.submitted_at) : <span className="text-muted">Not submitted</span>}</TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {tab === "contacts" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Contacts" description="People Council Finance can reach about this organization." />
            <ul className="divide-y divide-line">
              {contacts.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">No contacts on file.</li> : null}
              {contacts.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{c.full_name}</span>
                    {c.is_primary ? (
                      <Badge tone="ok" icon={Star}>
                        Primary
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted">{c.title}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    {c.email}
                    {c.phone ? <span className="num ml-3 text-muted">{c.phone}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Team" description="People with a LedgerLine account for this organization." />
            <ul className="divide-y divide-line">
              {team.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">No one from this organization has an account.</li> : null}
              {team.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="font-semibold">{t.full_name}</p>
                    <p className="text-sm text-muted">
                      {t.title ?? roleLabel(t.role as Role)} <span aria-hidden="true">&middot;</span> {t.email}
                    </p>
                  </div>
                  {t.active ? (
                    <Badge tone="ok" icon={Check}>
                      Active
                    </Badge>
                  ) : (
                    <Badge>Inactive</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {tab === "activity" ? (
        <Card>
          <CardHeader title="Activity" description="Recent actions on this organization's reports, newest first." />
          <ol className="divide-y divide-line">
            {activity.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">No activity has been recorded yet.</li> : null}
            {activity.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <AuditSentence row={row} />
                  {row.note ? <p className="mt-0.5 text-muted">{row.note}</p> : null}
                </div>
                <time dateTime={new Date(row.at).toISOString()} className="num whitespace-nowrap text-xs text-muted">
                  {formatDateTime(row.at)}
                </time>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {tab === "messages" ? (
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Subject</TH>
                <TH>Template</TH>
                <TH>To</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </tr>
            </THead>
            <tbody>
              {messages.length === 0 ? (
                <EmptyRow colSpan={5}>No messages have been sent to this organization.</EmptyRow>
              ) : (
                messages.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <Link href={`/finance/outbox/${m.id}`} className="font-semibold text-navy-800 hover:underline">
                        {m.subject}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{m.template}</TD>
                    <TD>{m.to_email}</TD>
                    <TD>
                      <Badge tone={m.status === "failed" ? "bad" : m.status === "sent" ? "ok" : "neutral"}>{m.status}</Badge>
                    </TD>
                    <TD>{formatDateTime(m.created_at)}</TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
