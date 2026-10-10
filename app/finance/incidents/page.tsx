import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime, nowDate } from "@/lib/dates";
import { incidentStatus, listContacts, listIncidents, notificationDeadline, NOTIFY_WITHIN_HOURS, remediationDeadline, REMEDIATE_WITHIN_DAYS, SEVERITIES, severityLabel, STATUS_LABEL } from "@/lib/ops/incidents";
import { ActionForm } from "@/components/ops/action-form";
import { DeadlineBadge } from "@/components/ops/deadline-badge";
import { addIncidentContact, recordIncident, setIncidentContactActive } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Label, Select, Textarea, Hint } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Security incidents" };

export default async function IncidentsPage() {
  const admin = await requireUser(["finance_admin"]);
  const now = nowDate();
  const { incidents, contacts } = await withClaims(admin.id, async (tx) => ({ incidents: await listIncidents(tx), contacts: await listContacts(tx) }));
  const activeContacts = contacts.filter((c) => c.active);

  return (
    <>
      <PageHeader
        title="Security incidents"
        description={`Record a breach or suspected breach. The Council's designated contacts are notified through the outbox straight away, the deadline is ${NOTIFY_WITHIN_HOURS} hours from detection, and a remediation report is due within ${REMEDIATE_WITHIN_DAYS} days. Records cannot be edited or deleted.`}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Security incidents" }]}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Record an incident" description={activeContacts.length === 0 ? "Add a designated contact before recording an incident." : `${activeContacts.length} designated ${activeContacts.length === 1 ? "contact" : "contacts"} will be notified.`} />
          <CardBody>
            <ActionForm action={recordIncident} submitLabel="Record and notify" pendingLabel="Recording">
              <div>
                <Label htmlFor="detectedAt" required>
                  Detected at (Eastern time)
                </Label>
                <Input id="detectedAt" name="detectedAt" type="datetime-local" />
              </div>
              <div>
                <Label htmlFor="severity" required>
                  Severity
                </Label>
                <Select id="severity" name="severity" defaultValue="">
                  <option value="" disabled>
                    Choose one
                  </option>
                  {SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="description" required>
                  What happened
                </Label>
                <Textarea id="description" name="description" rows={4} maxLength={4000} />
              </div>
              <div>
                <Label htmlFor="affectedData" required>
                  Data affected
                </Label>
                <Textarea id="affectedData" name="affectedData" rows={3} maxLength={2000} />
              </div>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Designated Council contacts" description="These people receive every incident notice and remediation report." />
          <Table density="compact">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Status</TH>
                <TH>
                  <span className="sr-only">Action</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {contacts.length === 0 ? (
                <EmptyRow colSpan={4}>No designated contacts yet.</EmptyRow>
              ) : (
                contacts.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <div className="font-semibold">{c.full_name}</div>
                      <div className="text-xs text-muted">{c.title}</div>
                    </TD>
                    <TD className="text-muted">{c.email}</TD>
                    <TD>{c.active ? <Badge tone="ok">Active</Badge> : <Badge>Off</Badge>}</TD>
                    <TD>
                      <ActionForm action={setIncidentContactActive} hidden={{ contactId: c.id, active: c.active ? "false" : "true" }} submitLabel={c.active ? "Switch off" : "Switch on"} variant="secondary" size="sm" resetOnSuccess={false} className="space-y-1" />
                    </TD>
                  </TR>
                ))
              )}
            </tbody>
          </Table>
          <CardBody className="border-t border-line">
            <ActionForm action={addIncidentContact} submitLabel="Add contact" pendingLabel="Adding" variant="secondary">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="contactName">Name</Label>
                  <Input id="contactName" name="name" maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="contactTitle">Title</Label>
                  <Input id="contactTitle" name="title" maxLength={120} />
                </div>
                <div>
                  <Label htmlFor="contactEmail">Email</Label>
                  <Input id="contactEmail" name="email" type="email" maxLength={254} />
                </div>
              </div>
              <Hint>Contacts are never deleted so past notices stay traceable. Switch a contact off instead.</Hint>
            </ActionForm>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Incident history" />
        <Table density="compact">
          <THead>
            <tr>
              <TH>Reference</TH>
              <TH>Detected</TH>
              <TH>Severity</TH>
              <TH>Council notice</TH>
              <TH>Remediation</TH>
            </tr>
          </THead>
          <tbody>
            {incidents.length === 0 ? (
              <EmptyRow colSpan={5}>No incidents have been recorded.</EmptyRow>
            ) : (
              incidents.map((i) => {
                const notice = notificationDeadline({ detectedAt: i.detected_at, notifiedAt: i.notified_at, now });
                const status = incidentStatus(i.reports === 0 ? null : { completed_on: i.latest_completed_on });
                const fix = remediationDeadline({ detectedAt: i.detected_at, completedOn: i.latest_completed_on, now });
                return (
                  <TR key={i.id} className="align-top">
                    <TD className="whitespace-nowrap font-semibold">
                      <Link href={`/finance/incidents/${i.id}`} className="text-link underline underline-offset-2 hover:text-link-hover">
                        {i.reference}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(i.detected_at)}</TD>
                    <TD>{severityLabel(i.severity)}</TD>
                    <TD>
                      <DeadlineBadge state={notice.state} minutes={notice.minutes} kind="notice" />
                    </TD>
                    <TD>
                      <div className="mb-1">{STATUS_LABEL[status]}</div>
                      <DeadlineBadge state={fix.state} minutes={fix.minutes} kind="remediation" />
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
