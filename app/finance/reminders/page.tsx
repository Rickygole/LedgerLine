import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, Check, Mail, Pause } from "lucide-react";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDate, todayInNewYork } from "@/lib/dates";
import { isoDate, one, type SearchParams } from "@/lib/finance/admin/params";
import { defaultPeriodId } from "@/lib/finance/review/filters";
import { describeOffset, listPeriods, listRules, offsetFor, previewTargets, renderSubject, shiftDate } from "@/lib/lifecycle/reminders";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { RestoreDefaultsForm, RuleActions, RuleForm, SendNowForm } from "@/components/finance/lifecycle/reminder-forms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reminders" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser(FINANCE_ROLES);
  const canEdit = user.role === "finance_admin";
  const params = await searchParams;
  const requestedDate = one(params, "date");
  const today = todayInNewYork();
  const date = isoDate(requestedDate) || today;
  const badDate = requestedDate !== "" && !isoDate(requestedDate);
  const editId = one(params, "edit");
  const adding = one(params, "add") === "1";

  const data = await withClaims(user.id, async (tx) => {
    const periods = await listPeriods(tx);
    const requested = one(params, "period");
    const period = periods.find((p) => p.id === requested) ?? periods.find((p) => p.id === defaultPeriodId(periods.map((x) => ({ id: x.id, dueOn: x.due_on })))) ?? periods[0];
    if (!period) return null;
    const rules = await listRules(tx, period.id);
    const targets = await previewTargets(tx, period.id, date);
    return { periods, period, rules, targets };
  });

  if (!data) {
    return (
      <>
        <PageHeader title="Reminders" crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Reminders" }]} />
        <Card>
          <CardBody>No reporting periods exist yet.</CardBody>
        </Card>
      </>
    );
  }

  const { periods, period, rules, targets } = data;
  const base = `/finance/reminders?period=${period.id}`;
  const editing = rules.find((r) => r.id === editId);
  const fresh = targets.filter((t) => !t.already_sent).length;
  const offset = offsetFor(period.due_on, date);
  const matching = rules.filter((r) => r.active && r.offset_days === offset);

  return (
    <>
      <PageHeader
        title="Reminders"
        description="Reminder rules email organizations about reports that are not submitted yet. Organizations with a submitted or accepted report are never reminded."
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Reminders" }]}
        actions={
          <ButtonLink href="/finance/outbox" variant="secondary">
            Open outbox
          </ButtonLink>
        }
      />
      {one(params, "saved") === "1" ? <p role="status" className="mb-4 rounded-md border border-ok/30 bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">Rule saved.</p> : null}
      {badDate ? <p role="alert" className="mb-4 rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm font-semibold text-bad">{requestedDate} is not a real calendar date. Showing {formatDate(today)} instead.</p> : null}
      {!canEdit ? <p className="mb-4 rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted">You can view rules and preview messages. Only a Finance administrator can change rules or send reminders.</p> : null}

      <form action="/finance/reminders" className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="period">Reporting period</Label>
          <Select id="period" name="period" defaultValue={period.id}>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} (due {formatDate(p.due_on)})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="date">Preview date</Label>
          <Input id="date" name="date" type="date" defaultValue={date} />
        </div>
        <button type="submit" className="h-10 rounded-md border border-line bg-white px-4 text-sm font-semibold shadow-sm hover:bg-navy-50">
          Show
        </button>
      </form>

      <div className="space-y-6">
        <Card>
          <CardHeader
            title={`Rules for ${period.label}`}
            description={`Due ${formatDate(period.due_on)}. A rule fires on the day that matches its timing.`}
            actions={canEdit ? <ButtonLink href={`${base}&date=${date}&add=1`} variant="secondary" size="sm">Add a rule</ButtonLink> : null}
          />
          <Table>
            <THead>
              <tr>
                <TH>Timing</TH>
                <TH>Fires on</TH>
                <TH>Subject</TH>
                <TH>Status</TH>
                <TH>Last run</TH>
                {canEdit ? <TH>Actions</TH> : null}
              </tr>
            </THead>
            <tbody>
              {rules.length === 0 ? (
                <EmptyRow colSpan={canEdit ? 6 : 5}>
                  <div className="space-y-3">
                    <p>No rules for this period.</p>
                    {canEdit ? <div className="flex justify-center"><RestoreDefaultsForm period={period.id} /></div> : null}
                  </div>
                </EmptyRow>
              ) : (
                rules.map((rule) => {
                  const fires = shiftDate(period.due_on, rule.offset_days);
                  return (
                    <TR key={rule.id}>
                      <TD className="whitespace-nowrap">{describeOffset(rule.offset_days)}</TD>
                      <TD className="whitespace-nowrap">
                        <Link href={`${base}&date=${fires}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                          {formatDate(fires)}
                        </Link>
                      </TD>
                      <TD className="max-w-md">
                        {renderSubject(rule.template_subject, { label: period.label, dueOn: period.due_on })}
                        <span className="mt-0.5 block text-xs text-muted">Template: {rule.template_subject}</span>
                      </TD>
                      <TD>{rule.active ? <Badge tone="ok" icon={Check}>On</Badge> : <Badge icon={Pause}>Off</Badge>}</TD>
                      <TD className="whitespace-nowrap">
                        {rule.last_sent ? (
                          <>
                            {formatDate(rule.last_sent)}
                            <span className="num block text-xs text-muted">
                              {rule.sent} {rule.sent === 1 ? "message" : "messages"} queued
                            </span>
                          </>
                        ) : (
                          <span className="text-muted">Not run yet</span>
                        )}
                      </TD>
                      {canEdit ? (
                        <TD>
                          <RuleActions rule={rule} editHref={`${base}&date=${date}&edit=${rule.id}`} />
                        </TD>
                      ) : null}
                    </TR>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card>

        {canEdit && (adding || editing) ? (
          <Card>
            <CardHeader title={editing ? "Edit rule" : "Add a rule"} />
            <CardBody>
              <RuleForm key={editing?.id ?? "new"} period={period.id} rule={editing} cancelHref={`${base}&date=${date}`} />
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title={`Preview for ${formatDate(date)}`}
            description={
              matching.length === 0
                ? `No active rule fires on this date. For ${period.label} this date is ${describeOffset(offset).toLowerCase()}.`
                : `${targets.length} ${targets.length === 1 ? "organization qualifies" : "organizations qualify"} for ${matching.length === 1 ? "one rule" : `${matching.length} rules`}. This is exactly what Add to outbox would queue.`
            }
          />
          {targets.length > 0 ? (
            <>
              {canEdit ? (
                <CardBody className="border-b border-line">
                  <SendNowForm period={period.id} date={date} today={today} count={targets.length} fresh={fresh} />
                </CardBody>
              ) : null}
              <Table>
                <THead>
                  <tr>
                    <TH>Organization</TH>
                    <TH>Sends to</TH>
                    <TH>Reports still open</TH>
                    <TH>Rule</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <tbody>
                  {targets.map((t) => (
                    <TR key={`${t.rule_id}-${t.org_id}`} className="align-top">
                      <TD>
                        <Link href={`/finance/organizations/${t.org_id}`} className="font-semibold text-link underline underline-offset-2 hover:text-link-hover">
                          {t.org_name}
                        </Link>
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-medium text-link underline underline-offset-2 hover:text-link-hover">Show message</summary>
                          <div className="mt-2 max-w-xl rounded-md border border-line bg-surface p-3 text-sm">
                            <p className="font-semibold">{t.subject}</p>
                            <p className="mt-2 whitespace-pre-wrap">{t.body}</p>
                          </div>
                        </details>
                      </TD>
                      <TD>
                        {t.contact_name}
                        <div className="text-xs text-muted">{t.to_email}</div>
                      </TD>
                      <TD className="max-w-xs">{t.initiatives}</TD>
                      <TD className="whitespace-nowrap">{describeOffset(t.offset_days)}</TD>
                      <TD className="whitespace-nowrap">{t.already_sent ? <Badge icon={Check}>Already in outbox</Badge> : <Badge tone="info" icon={Mail}>Will be queued</Badge>}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <BellRing className="h-6 w-6 text-muted" aria-hidden="true" />
              <p className="text-[15px] font-semibold text-ink">Nothing goes out on this date</p>
              <p className="max-w-md text-sm text-muted">Pick a date from the Fires on column above to see who that rule would email.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
