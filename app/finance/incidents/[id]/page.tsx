import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate, formatDateTime, nowDate } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import { EVENT_LABEL, incidentStatus, loadEvents, loadIncident, loadRemediations, notificationDeadline, remediationDeadline, severityLabel, STATUS_LABEL } from "@/lib/ops/incidents";
import { ActionForm } from "@/components/ops/action-form";
import { DeadlineBadge } from "@/components/ops/deadline-badge";
import { recordRemediation } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, DescriptionList } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { Input, Label, Textarea, Hint } from "@/components/ui/field";
import { plural } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Security incident" };

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser(["finance_admin"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await withClaims(admin.id, async (tx) => {
    const incident = await loadIncident(tx, id);
    if (!incident) return null;
    return { incident, reports: await loadRemediations(tx, id), events: await loadEvents(tx, id) };
  });
  if (!data) notFound();
  const { incident, reports, events } = data;
  const now = nowDate();
  const notice = notificationDeadline({ detectedAt: incident.detected_at, notifiedAt: incident.notified_at, now });
  const fix = remediationDeadline({ detectedAt: incident.detected_at, completedOn: incident.latest_completed_on, now });
  const status = incidentStatus(reports.length === 0 ? null : { completed_on: incident.latest_completed_on });
  const latest = reports[0];

  return (
    <>
      <PageHeader
        title={`${incident.reference}: ${severityLabel(incident.severity)} severity`}
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Security incidents", href: "/finance/incidents" }, { label: incident.reference }]}
        meta={
          <>
            <Badge tone={status === "closed" ? "ok" : "warn"}>{STATUS_LABEL[status]}</Badge>
            <DeadlineBadge state={notice.state} minutes={notice.minutes} kind="notice" />
            <DeadlineBadge state={fix.state} minutes={fix.minutes} kind="remediation" />
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Incident" />
          <CardBody className="space-y-4">
            <DescriptionList
              columns={1}
              items={[
                { label: "Detected", value: formatDateTime(incident.detected_at) },
                { label: "What happened", value: <span className="whitespace-pre-wrap">{incident.description}</span> },
                { label: "Data affected", value: <span className="whitespace-pre-wrap">{incident.affected_data}</span> },
                { label: "Council notice due", value: formatDateTime(incident.notify_due_at) },
                { label: "Council notified", value: `${formatDateTime(incident.notified_at)}, ${incident.contacts_notified} ${plural(incident.contacts_notified, "contact", "contacts")}` },
                { label: "Remediation report due", value: formatDateTime(incident.remediation_due_at) },
                { label: "Recorded by", value: `${incident.recorded_by_name}, ${formatDateTime(incident.recorded_at)}` },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="History" description="Append only. Entries cannot be changed or removed." />
          <CardBody>
            <ol className="divide-y divide-line border-y border-line">
              {events.map((event) => (
                <li key={event.id} className="py-2.5 text-sm">
                  <span className="font-semibold">{EVENT_LABEL[event.kind] ?? event.kind}</span>
                  <span className="text-muted">
                    {" "}
                    {formatDateTime(event.at)} by {event.actor_name}
                    {event.detail ? `, ${event.detail}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Remediation report" description="Root cause, actions taken and the plan to reduce the risk of a repeat. Save an update any time; the latest one counts. Each save is sent to the designated contacts." />
        <CardBody className="space-y-6">
          {latest ? (
            <div>
              <h3 className="mb-2 text-sm font-bold">Latest report, {formatDateTime(latest.recorded_at)} by {latest.recorded_by_name}</h3>
              <DescriptionList
                columns={1}
                items={[
                  { label: "Root cause", value: <span className="whitespace-pre-wrap">{latest.root_cause}</span> },
                  { label: "Actions taken", value: <span className="whitespace-pre-wrap">{latest.actions}</span> },
                  { label: "Plan to reduce future risk", value: <span className="whitespace-pre-wrap">{latest.prevention}</span> },
                  { label: "Completed", value: latest.completed_on ? formatDate(latest.completed_on) : "Not yet completed" },
                ]}
              />
              {reports.length > 1 ? <p className="mt-3 text-sm text-muted">{reports.length - 1} earlier {reports.length === 2 ? "version is" : "versions are"} kept in the audit log.</p> : null}
            </div>
          ) : null}
          <ActionForm action={recordRemediation} hidden={{ incidentId: incident.id }} submitLabel={latest ? "Save updated report" : "Save report"} pendingLabel="Saving" resetOnSuccess={false}>
            <div>
              <Label htmlFor="rootCause">
                Root cause
              </Label>
              <Textarea id="rootCause" aria-required="true" name="rootCause" rows={3} maxLength={4000} defaultValue={latest?.root_cause} />
            </div>
            <div>
              <Label htmlFor="actions">
                Actions taken
              </Label>
              <Textarea id="actions" aria-required="true" name="actions" rows={3} maxLength={4000} defaultValue={latest?.actions} />
            </div>
            <div>
              <Label htmlFor="prevention">
                Plan to reduce the risk of a repeat
              </Label>
              <Textarea id="prevention" aria-required="true" name="prevention" rows={3} maxLength={4000} defaultValue={latest?.prevention} />
            </div>
            <div className="max-w-xs">
              <Label htmlFor="completedOn" optional>Completed on</Label>
              <Hint id="completedOn-hint">Leave empty while work continues.</Hint>
              <Input id="completedOn" name="completedOn" type="date" aria-describedby="completedOn-hint" defaultValue={latest?.completed_on ?? ""} />
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
