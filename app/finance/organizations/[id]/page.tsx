import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check, CheckCircle2, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { FINANCE_ROLES, requireUser, roleLabel, type Role } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { daysPastDue, formatDate, formatDateTime } from "@/lib/dates";
import { isMissing, reportState } from "@/lib/reporting";
import { formatCurrency, plural } from "@/lib/format";
import { ProfileHeader } from "@/components/ui/profile-header";
import { PrintButton } from "@/components/ui/print-button";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { Badge, StateBadge } from "@/components/ui/status-badge";
import { AwardPeriods, ContractCell, SponsorsCell } from "@/components/finance/admin/award-cells";
import { Stat } from "@/components/ui/stat";
import { MiniDistrictMap } from "@/components/finance/map/mini-district-map";
import { ReportingRecord } from "@/components/finance/reporting-record";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { TabNav } from "@/components/finance/admin/tab-nav";
import { AuditSentence } from "@/components/finance/admin/audit-line";
import { loadOrganization, type OrgAward } from "@/lib/finance/admin/organizations";
import { orgActivity } from "@/lib/finance/admin/audit";
import { templateLabel } from "@/lib/finance/admin/outbox";
import { orgTypeLabel } from "@/lib/domain";
import { one, pickOne, type SearchParams } from "@/lib/finance/admin/params";
import { isUuid } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organization profile" };

const TABS = ["overview", "awards", "reports", "contacts", "activity", "messages"] as const;

export default async function OrganizationProfile({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const tab = pickOne(one(await searchParams, "tab"), TABS, "overview");

  const data = await withClaims(user.id, async (tx) => {
    const loaded = await loadOrganization(tx, id);
    if (!loaded) return null;
    const activity = tab === "activity" ? await orgActivity(tx, id) : [];
    return { ...loaded, activity };
  });
  if (!data) notFound();
  const { org, awards, reports, contacts, team, messages, activity } = data;

  const years = [...new Set(awards.map((a) => a.fiscal_year_id))].sort();
  const totalAwarded = awards.reduce((sum, a) => sum + Number(a.award_amount), 0);
  const allPeriods = awards.flatMap((a) => a.periods ?? []);
  const dueSoFar = allPeriods.filter((p) => daysPastDue(p.due_on) > 0).length;
  const acceptedDue = allPeriods.filter((p) => daysPastDue(p.due_on) > 0 && p.status === "accepted").length;
  const sponsorDistricts = [...new Set(awards.flatMap((a) => (a.sponsors ?? []).map((s) => s.district)))].sort((a, b) => a - b);
  const mapFills: Record<number, string> = org.council_district ? { [org.council_district]: "#1f4e85" } : {};
  const mapCaption = `${org.council_district ? `District ${org.council_district} (location).` : "No Council district on file."} ${sponsorDistricts.length ? `Funded by Council Members in ${plural(sponsorDistricts.length, "District", "Districts")} ${sponsorDistricts.join(", ")}.` : "No sponsoring Council Members on file."}`;
  const overdue = awards.flatMap((a) => a.periods ?? []).filter((p) => isMissing(p.status, p.due_on)).length;
  const primary = contacts.find((c) => c.is_primary) ?? contacts[0] ?? null;
  const address = `${org.address_line}, ${org.city}, ${org.state} ${org.postal_code}`;

  return (
    <>
      <ProfileHeader
        title={org.legal_name}
        subtitle={org.dba_name ? `Doing business as ${org.dba_name}` : undefined}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Organizations", href: "/finance/organizations" }, { label: org.legal_name }]}
        meta={[
          <Badge key="type">
            {orgTypeLabel(org.org_type)}
          </Badge>,
          <span key="ein" className="whitespace-nowrap font-mono text-[13px]">
            EIN {org.ein}
          </span>,
          <span key="area" className="whitespace-nowrap">
            {org.borough}
            {org.council_district ? `, District ${org.council_district}` : ""}
          </span>,
          org.founded_year ? (
            <span key="founded" className="num whitespace-nowrap">
              Founded {org.founded_year}
            </span>
          ) : null,
          overdue > 0 ? (
            <Badge key="compliance" tone="bad" icon={AlertTriangle}>
              {overdue} missing
            </Badge>
          ) : (
            <Badge key="compliance" tone="ok" icon={CheckCircle2}>
              Reports current
            </Badge>
          ),
        ]}
        actions={
          <>
            {primary ? (
              <a href={`mailto:${primary.email}`} className={buttonClass("secondary", "sm")}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Email primary contact
              </a>
            ) : null}
            <PrintButton label="Print profile" />
          </>
        }
        tabs={
          <TabNav
            attached
            base={`/finance/organizations/${id}`}
            label="Organization sections"
            current={tab}
            tabs={[
              { key: "overview", label: "Overview" },
              { key: "awards", label: "Awards", count: awards.length },
              { key: "reports", label: "Reports", count: reports.length },
              { key: "contacts", label: "Contacts and team", count: contacts.length + team.length },
              { key: "activity", label: "Activity" },
              { key: "messages", label: "Messages", count: messages.length },
            ]}
          />
        }
      />

      {tab === "overview" ? (
        <>
          <section aria-label="Compliance at a glance" className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat label="Total awarded" value={formatCurrency(totalAwarded, { cents: false })} sub={`across ${awards.length} ${plural(awards.length, "award", "awards")}${years.length ? ` (${years.join(" and ")})` : ""}`} />
            <Stat label="Reports accepted" value={<>{acceptedDue} <span className="text-lg font-semibold tracking-normal text-ink-2">of {dueSoFar}</span></>} sub={dueSoFar === 0 ? "No reports due yet" : "of reports due so far"} />
            <Stat label="Missing" value={overdue} tone={overdue > 0 ? "bad" : "neutral"} sub="Past due, nothing submitted" action={overdue > 0 ? { href: `/finance/submissions?q=${encodeURIComponent(org.ein)}&bucket=missing`, label: plural(overdue, "See missing report", "See missing reports") } : undefined} />
          </section>
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="About" />
              <CardBody className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_200px]">
                <div className="min-w-0">
                <h3 className="text-[13px] font-semibold text-muted">Mission</h3>
                <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed text-ink">{org.mission ?? "No mission statement on file."}</p>
                <div className="mt-5 border-t border-line pt-5">
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
                <figure className="md:border-l md:border-line md:pl-6">
                  <MiniDistrictMap fills={mapFills} outlined={sponsorDistricts} label={`Map of Council districts. ${mapCaption}`} />
                  <figcaption className="mt-2 text-[13px] leading-5 text-muted">{mapCaption}</figcaption>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-2" aria-hidden="true">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-4 bg-harbor-700" />
                      Location
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-4 border-2 border-action bg-geo-0" />
                      Sponsor
                    </span>
                  </p>
                </figure>
              </CardBody>
            </Card>
            <Card className="self-start">
              <CardHeader title="Contact" />
              <ul className="space-y-3 px-5 py-4 text-sm">
                <li className="flex gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <span>{address}</span>
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
                      <a href={`mailto:${primary.email}`} className="mt-1 block break-all font-medium text-link underline underline-offset-2 hover:text-link-hover">
                        {primary.email}
                      </a>
                      {primary.phone ? <p className="num text-muted">{primary.phone}</p> : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">No primary contact on file.</p>
                )}
              </div>
            </Card>
          </div>
          <Card className="mt-6">
            <CardHeader
              title="Awards"
              actions={
                <Link href={`/finance/organizations/${id}?tab=awards`} className="text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                  Open awards tab
                </Link>
              }
            />
            <ReportingRecord awards={awards} />
            <AwardsTable awards={awards} />
          </Card>
        </>
      ) : null}

      {tab === "awards" ? (
        <Card>
          <AwardsTable awards={awards} />
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
                      <Link href={`/finance/submissions/${r.id}`} className="whitespace-nowrap font-mono text-[13px] font-semibold text-link underline underline-offset-2 hover:text-link-hover">
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Contacts" />
            <ul className="divide-y divide-line">
              {contacts.length === 0 ? <li className="px-5 py-10 text-center text-sm text-muted">No contacts on file.</li> : null}
              {contacts.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{c.full_name}</span>
                    {c.is_primary ? (
                      <Badge tone="info">
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
            <CardHeader title="Team" />
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
          <CardHeader title="Activity" />
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
                <EmptyRow colSpan={5}>No messages for this organization yet.</EmptyRow>
              ) : (
                messages.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <Link href={`/finance/outbox/${m.id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                        {m.subject}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{templateLabel(m.template)}</TD>
                    <TD>{m.to_email}</TD>
                    <TD>
                      <Badge tone={m.status === "failed" ? "bad" : m.status === "sent" ? "ok" : "neutral"}>{m.status === "sent" ? "Sent" : m.status === "failed" ? "Failed" : "Queued"}</Badge>
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

function AwardsTable({ awards }: { awards: OrgAward[] }) {
  return (
    <Table density="compact">
      <THead>
        <tr>
          <TH>Initiative</TH>
          <TH>Year</TH>
          <TH>Agency</TH>
          <TH align="right">Award</TH>
          <TH>Funding and sponsor</TH>
          <TH>Contract</TH>
          <TH>Reports</TH>
        </tr>
      </THead>
      <tbody>
        {awards.length === 0 ? (
          <EmptyRow colSpan={7}>This organization has no awards yet.</EmptyRow>
        ) : (
          awards.map((a) => (
            <TR key={a.assignment_id}>
              <TD className="min-w-[14rem]">
                <Link href={`/finance/initiatives/${a.initiative_id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                  {a.name}
                </Link>
                <div className="font-mono text-[13px] text-muted">{a.code}</div>
              </TD>
              <TD className="whitespace-nowrap">{a.fiscal_year_id}</TD>
              <TD>{a.sponsoring_agency ?? <span className="text-muted">Not recorded</span>}</TD>
              <TD align="right">{formatCurrency(Number(a.award_amount))}</TD>
              <TD>
                <SponsorsCell sponsors={a.sponsors} source={a.funding_source} />
              </TD>
              <TD>
                <ContractCell status={a.contract_status} number={a.contract_number} registeredOn={a.contract_registered_on} />
              </TD>
              <TD>
                <AwardPeriods periods={a.periods} />
              </TD>
            </TR>
          ))
        )}
      </tbody>
    </Table>
  );
}
