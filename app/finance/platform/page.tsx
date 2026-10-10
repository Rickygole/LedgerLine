import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, Download, FileLock2, Headset, Server, ShieldAlert, Users2 } from "lucide-react";
import { FINANCE_ROLES, requireUser, roleLabel, type Role } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/dates";
import { platformFacts } from "@/lib/lifecycle/platform";
import { getHealth, hostingInfo } from "@/lib/ops/health";
import { listSupport, supportState } from "@/lib/ops/support";
import { listIncidents } from "@/lib/ops/incidents";
import { loadReadiness } from "@/lib/ops/readiness";
import { listReviews } from "@/lib/ops/reviews";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Timeline, type Milestone } from "@/components/finance/lifecycle/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Platform and delivery" };

const CONTROLS = [
  {
    id: "AC-3",
    name: "Access enforcement",
    how: "Row level security is switched on for every data table. Organizations can read only their own reports. Finance roles see everything, and only administrators change configuration.",
    live: true,
  },
  {
    id: "AU-9",
    name: "Protection of audit information",
    how: "The audit log and the submitted report revisions are append only. Database triggers reject any update, delete or truncate, even for the application account.",
    live: true,
  },
  {
    id: "SI-10",
    name: "Information input validation",
    how: "Every report is validated on the server before it can be submitted: required answers, field formats, word limits and budget balance. Browser checks are a convenience only.",
    live: false,
  },
  {
    id: "SC-8",
    name: "Transmission confidentiality",
    how: "All traffic uses HTTPS (TLS), and the application connects to its database over TLS. Browsers are told never to frame or sniff the pages.",
    live: false,
  },
  {
    id: "IA-5",
    name: "Authenticator management",
    how: "Passwords are stored only as salted hashes. Sessions are signed, expire, and are checked against the database on every request, so deactivating a user takes effect immediately.",
    live: false,
  },
  {
    id: "AU-2",
    name: "Event logging",
    how: "Submissions, returns, acceptances, corrections, form publishing, role changes, rollover and reminder runs each write an audit event with who, when, and the before and after values.",
    live: true,
  },
];

const SUPPORT_TIERS = [
  { tier: "Tier 1", who: "Help desk", scope: "Sign in problems, password resets, how do I questions, user and organization account changes.", target: "First response within 24 hours" },
  { tier: "Tier 2", who: "Application support", scope: "Report and form issues, data corrections, reminder and export problems, configuration changes.", target: "First response within 24 hours; same business day when it blocks a filing deadline" },
  { tier: "Tier 3", who: "Engineering", scope: "Defects, performance, security events, platform and database incidents.", target: "Acknowledged within 4 hours; critical outages within 1 hour" },
];

const MILESTONES: Milestone[] = [
  { when: "Nov 2026", title: "Kickoff and discovery", detail: "Confirm the initiative list, the standard questions, the user roster and the permission groups with Council Finance." },
  { when: "Nov to Dec 2026", title: "Configure and load", detail: "Build initiative forms from the question library, load organizations and awards, and set reminder schedules." },
  { when: "Dec 2026", title: "Security review and environment ready", detail: "Production environment built in Azure Government, controls mapped to NIST 800-53, and the breach procedure agreed." },
  { when: "Jan 4 to Jan 15, 2027", title: "User acceptance testing", detail: "Finance staff and a group of funded organizations work through real scenarios. Defects are logged, fixed and retested before sign off." },
  { when: "Jan 11 to Jan 22, 2027", title: "Training", detail: "Role based sessions for Finance administrators, analysts and viewers, and live and recorded walkthroughs for funded organizations." },
  { when: "Jan 25, 2027", title: "Cutover rehearsal and go or no go", detail: "A full dry run of the launch checklist. Finance leadership makes the final go decision." },
  { when: "Feb 1, 2027", title: "Go live", detail: "The system opens for reporting. Launch week support runs with extended hours and daily check ins.", goal: true },
];

function Ids({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <Badge key={id} tone="info">
          {id}
        </Badge>
      ))}
    </div>
  );
}

export default async function PlatformPage() {
  const user = await requireUser(FINANCE_ROLES);
  const isAdmin = user.role === "finance_admin";
  const now = new Date();
  const { facts, ops } = await withClaims(user.id, async (tx) => {
    const facts = await platformFacts(tx);
    if (!isAdmin) return { facts, ops: null };
    const support = await listSupport(tx, {});
    const states = support.map((r) => supportState({ createdAt: r.created_at, firstResponseAt: r.first_response_at, closedAt: r.closed_at, now }));
    const incidents = await listIncidents(tx);
    const readiness = await loadReadiness(tx);
    const reviews = await listReviews(tx);
    return {
      facts,
      ops: {
        supportOpen: states.filter((x) => x === "open" || x === "overdue").length,
        supportOverdue: states.filter((x) => x === "overdue").length,
        incidents: incidents.length,
        training: readiness.training,
        uat: readiness.uat,
        reviewsSigned: reviews.filter((r) => r.status === "signed_off").length,
      },
    };
  });
  const health = isAdmin ? await getHealth() : null;
  const hosting = health?.hosting ?? hostingInfo();
  const financeUsers = facts.usersByRole.filter((r) => r.role !== "cbo_submitter").reduce((sum, r) => sum + r.n, 0);

  return (
    <>
      <PageHeader
        title="Platform and delivery"
        description="How LedgerLine meets the hosting, security, data, support and delivery requirements. Sections describe the proposed approach. Figures marked as live come from this running system."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Platform and delivery" }]}
        meta={<Badge tone="warn">Proposed approach, not a contract term</Badge>}
        actions={
          user.role === "finance_admin" ? (
            <ButtonLink href="/trust" variant="ghost" size="sm">
              Requirements traceability
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {isAdmin && health ? (
          <Card>
            <CardHeader title="Platform status" description="Read from the same health check that monitoring tools call at /api/health." actions={<Ids ids={["US-062"]} />} />
            <CardBody>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Service" value={health.status === "ok" ? "Healthy" : "Degraded"} tone={health.status === "ok" ? "ok" : "bad"} hint={`Checked ${formatDateTime(health.checkedAt)}`} />
                <Stat label="Database" value={health.database.ok ? "Connected" : "Unreachable"} tone={health.database.ok ? "ok" : "bad"} hint={health.database.latencyMs === null ? "No response" : `${health.database.latencyMs} ms`} />
                <Stat label="Database version" value={health.migrations.applied} tone={health.migrations.ok ? "ok" : "bad"} hint={health.migrations.latest ?? "None applied"} />
                <Stat label="Build" value={health.build.commit ?? "Not recorded"} hint={`Hosting: ${health.hosting.provider}, ${health.hosting.region}`} />
              </div>
              <p className="mt-3 text-sm text-muted">Every response carries a request ID. It is shown on error pages and written to the server log with any error, so a reported problem can be traced to one request.</p>
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Hosting and security" description="Hosted outside Council owned servers, in a cloud that meets NIST 800-53." actions={<Ids ids={["US-053", "US-054", "BR-026"]} />} />
          <CardBody className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-line p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-navy-700" aria-hidden="true" /> Current environment</p>
                <p className="mt-1 text-sm text-muted">
                  Hosting provider <span className="font-semibold text-ink">{hosting.provider}</span>, region <span className="font-semibold text-ink">{hosting.region}</span>. Not hosted on Council servers. These values come from the deployment settings and are reported by the running system at <span className="font-mono text-xs">/api/health</span>. They are declared, not independently audited. Traffic is encrypted in transit and the database enforces row level security.
                </p>
              </div>
              <div className="rounded-md border border-navy-200 bg-navy-50/50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><Server className="h-4 w-4 text-navy-700" aria-hidden="true" /> Proposed production path</p>
                <p className="mt-1 text-sm text-muted">Azure Government, a FedRAMP High authorized cloud. Application on Azure App Service, data in Azure Database for PostgreSQL, files in Azure Blob Storage with customer managed keys. The same database design moves across without change.</p>
              </div>
            </div>
            <p className="rounded-md border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-ink">
              <span className="font-semibold">Delivery commitments, not yet met.</span> Hosting in Azure Government and compliance with FedRAMP or NIST 800-53 are proposed commitments. They are confirmed by the production build and the security review in December 2026, and this system cannot prove them today. The control mapping below shows what the application already enforces.
            </p>
            <div>
              <h3 className="mb-2 text-sm font-semibold">NIST 800-53 control mapping</h3>
              <div className="overflow-hidden rounded-md border border-line">
                <Table>
                  <THead>
                    <tr>
                      <TH>Control</TH>
                      <TH>What it asks for</TH>
                      <TH>How LedgerLine meets it</TH>
                      <TH>Live evidence</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {CONTROLS.map((c) => (
                      <TR key={c.id} className="align-top">
                        <TD className="font-semibold">{c.id}</TD>
                        <TD className="whitespace-nowrap">{c.name}</TD>
                        <TD className="max-w-xl text-muted">{c.how}</TD>
                        <TD className="text-xs">
                          {c.id === "AC-3" ? `${facts.protectedTables} of ${facts.totalTables} tables protected by ${facts.policies} policies` : null}
                          {c.id === "AU-9" ? `${facts.appendOnlyTriggers} append only guards, ${facts.auditEvents.toLocaleString("en-US")} events held` : null}
                          {c.id === "AU-2" ? `${facts.auditEvents.toLocaleString("en-US")} audit events recorded` : null}
                          {!c.live ? <span className="text-muted">Enforced in the application</span> : null}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              </div>
              <p className="mt-2 text-xs text-muted">A complete control mapping and a System Security Plan would be delivered with the production environment.</p>
            </div>
          </CardBody>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Data ownership and export" description="The Council owns all system data." actions={<Ids ids={["US-055", "BR-020"]} />} />
            <CardBody className="space-y-3 text-sm">
              <p>Every record, answer, attachment and audit event belongs to the Council. None of it is stored in a format only the vendor can read.</p>
              <p>Reports export as Excel workbooks (.xlsx) and comma separated files (.csv). A Finance administrator can also download the whole database as a zip of CSV files with a README that describes every table and column. Attachments stay in the files that organizations uploaded.</p>
              <p>On contract end, the full database and files are handed over and then securely removed from vendor systems on written request.</p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/finance/submissions" variant="secondary" size="sm">
                  <Download className="h-4 w-4" aria-hidden="true" /> Open reports to export
                </ButtonLink>
                {isAdmin ? (
                  <ButtonLink href="/finance/data" variant="secondary" size="sm">
                    <Download className="h-4 w-4" aria-hidden="true" /> Export all data
                  </ButtonLink>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Retention" description="Submitted data is kept permanently." actions={<Ids ids={["US-056", "BR-019"]} />} />
            <CardBody className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Report revisions kept" value={facts.revisions.toLocaleString("en-US")} icon={FileLock2} hint="Live count" />
                <Stat label="Audit events kept" value={facts.auditEvents.toLocaleString("en-US")} icon={Clock} hint={facts.firstAudit ? `Since ${formatDate(facts.firstAudit)}` : "Live count"} href="/finance/audit" />
              </div>
              <p>No delete path exists. The application cannot remove a submitted report, a revision or an audit event, and the database rejects the attempt. Corrections add a new revision with a reason instead of overwriting history.</p>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Breach notification" description="The Council is told about any breach, with a remediation plan." actions={<Ids ids={["US-058", "BR-025"]} />} />
          <CardBody>
            <ol className="grid gap-4 md:grid-cols-4">
              {[
                ["1. Detect and contain", "Monitoring or a report raises the alert. Affected accounts and access are shut off immediately.", "Within 1 hour"],
                ["2. Notify the Council", "The Council Finance security contact is told by phone and email with what is known so far.", "Within 24 hours of confirmation"],
                ["3. Assess and report", "A written report lists what data was involved, who was affected and how it happened.", "Within 72 hours"],
                ["4. Remediate and review", "A remediation plan is agreed, fixes are verified, and a closing review is shared with the Council.", "Plan within 7 days"],
              ].map(([title, text, when]) => (
                <li key={title} className="rounded-md border border-line p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-navy-700" aria-hidden="true" /> {title}</p>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                  <p className="mt-2 text-[13px] font-semibold text-navy-700">{when}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted">
              Finance administrators record incidents, notify the Council&apos;s designated contacts and track the remediation report in the app.{" "}
              {isAdmin && ops ? (
                <>
                  <Link href="/finance/incidents" className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">Open security incidents</Link> ({ops.incidents} recorded).
                </>
              ) : null}{" "}
              The time limits above are proposed. The contract sets the final terms.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Scale" description="No limit on submitting users, and 50 to 100 Finance users with different permissions." actions={<Ids ids={["US-059", "US-060", "BR-017", "BR-018"]} />} />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {facts.usersByRole.map((r) => (
                <Stat key={r.role} label={roleLabel(r.role as Role)} value={r.n.toLocaleString("en-US")} hint="Active accounts" icon={Users2} />
              ))}
              <Stat label="Funded organizations" value={facts.organizations.toLocaleString("en-US")} hint="Live count" href="/finance/organizations" />
            </div>
            <p className="text-sm">
              This system holds <span className="num font-semibold">{financeUsers}</span> Finance accounts across three permission levels. Automated tests create 100 Finance users across the three levels and check what each level can and cannot do, and create 5,000 submitting accounts to show that no cap exists. Submitting users are not licensed or capped: each funded organization can add as many staff as it needs.
            </p>
            {user.role === "finance_admin" ? (
              <div>
                <Link href="/finance/users" className="text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover">Manage users and roles</Link>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Support model" description="Vendor help with accounts, post launch support and fast responses." actions={<Ids ids={["US-061", "US-062", "US-063", "BR-029"]} />} />
          <Table>
            <THead>
              <tr>
                <TH>Tier</TH>
                <TH>Handled by</TH>
                <TH>Covers</TH>
                <TH>Response target</TH>
              </tr>
            </THead>
            <tbody>
              {SUPPORT_TIERS.map((t) => (
                <TR key={t.tier} className="align-top">
                  <TD className="font-semibold"><span className="inline-flex items-center gap-2"><Headset className="h-4 w-4 text-navy-700" aria-hidden="true" />{t.tier}</span></TD>
                  <TD>{t.who}</TD>
                  <TD className="max-w-md text-muted">{t.scope}</TD>
                  <TD>{t.target}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
          <CardBody className="border-t border-line text-sm text-muted">
            Every request gets a first response within 24 hours. After launch, the vendor watches uptime and errors and applies security patches as part of the support service.
            <span className="mt-2 block">
              Anyone signed in can send a request from <span className="font-semibold">Get help</span>.
              {isAdmin && ops ? (
                <>
                  {" "}
                  <Link href="/finance/support" className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">Open the support queue</Link>: {ops.supportOpen} waiting, {ops.supportOverdue} overdue.
                </>
              ) : null}
            </span>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Annual review" description="A yearly review of the reporting structure with Council Finance." actions={<Ids ids={["US-064", "BR-028"]} />} />
          <CardBody className="space-y-3 text-sm">
            <p>Each spring, before the fiscal year ends, the vendor meets with Finance to review the initiatives, standard questions, forms and permissions. The review covers what to keep, rename, combine or retire, how support and uptime performed, and what to change next year.</p>
            <p>The decisions feed straight into the annual rollover, which copies forms and funded organizations into the new year and keeps every initiative&apos;s history linked.</p>
            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/finance/reviews" variant="secondary" size="sm">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Annual structure review{ops ? ` (${ops.reviewsSigned} signed off)` : ""}
                </ButtonLink>
                <ButtonLink href="/finance/rollover" variant="secondary" size="sm">
                  Open annual rollover
                </ButtonLink>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Delivery timeline to go live" description="Proposed plan, with formal testing and training before the February 1, 2027 target. The go-live date is a delivery commitment and this system does not confirm it." actions={<Ids ids={["US-065", "US-066", "BR-027"]} />} />
          <CardBody className="space-y-4">
            <Timeline items={MILESTONES} />
            {isAdmin && ops ? (
              <p className="text-sm text-muted">
                <Link href="/finance/readiness" className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">Go-live readiness</Link>: {ops.training.percent ?? 0}% of Finance users trained, {ops.uat.percent ?? 0}% of test scenarios passing.
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
