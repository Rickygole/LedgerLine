import Link from "next/link";
import { createSupportRequest, replyToSupportRequest } from "@/app/actions/support";
import type { CurrentUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { formatDateTime, nowDate } from "@/lib/dates";
import { isUuid } from "@/lib/finance/admin/params";
import { CATEGORIES, categoryLabel, listSupport, loadMessages, loadSupport, RESPONSE_TARGET_HOURS, supportState } from "@/lib/ops/support";
import { ActionForm } from "@/components/ops/action-form";
import { SupportStateBadge, Thread } from "@/components/ops/support-parts";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";

export async function HelpPage({ user, home, base, selected }: { user: CurrentUser; home: { label: string; href: string }; base: string; selected: string }) {
  const now = nowDate();
  const data = await withClaims(user.id, async (tx) => {
    const rows = await listSupport(tx, { requester: user.id });
    const current = isUuid(selected) ? await loadSupport(tx, selected) : null;
    const open = current && current.requester === user.id ? current : null;
    const messages = open ? await loadMessages(tx, open.id) : [];
    return { rows, open, messages };
  });
  const open = data.open;
  return (
    <>
      <PageHeader
        title="Get help"
        description={`Ask Finance support about your account, a report or your data. Support aims to reply to every request within ${RESPONSE_TARGET_HOURS} hours.`}
        crumbs={[{ label: home.label, href: home.href }, { label: "Get help" }]}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Send a request" description="Say what you were trying to do and what happened." />
          <CardBody>
            <ActionForm action={createSupportRequest} submitLabel="Send request" pendingLabel="Sending">
              <div>
                <Label htmlFor="category" required>
                  What do you need help with
                </Label>
                <Select id="category" name="category" defaultValue="">
                  <option value="" disabled>
                    Choose one
                  </option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="subject" required>
                  Subject
                </Label>
                <Input id="subject" name="subject" maxLength={120} />
              </div>
              <div>
                <Label htmlFor="body" required>
                  Details
                </Label>
                <Textarea id="body" name="body" maxLength={4000} rows={6} />
              </div>
            </ActionForm>
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Your requests" description="Only you can see these." />
            <Table density="compact">
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Subject</TH>
                  <TH>Status</TH>
                  <TH>Sent</TH>
                </tr>
              </THead>
              <tbody>
                {data.rows.length === 0 ? (
                  <EmptyRow colSpan={4}>You have not sent a request yet.</EmptyRow>
                ) : (
                  data.rows.map((row) => (
                    <TR key={row.id}>
                      <TD className="whitespace-nowrap font-semibold">{row.reference}</TD>
                      <TD>
                        <Link href={`${base}?request=${row.id}`} className="text-link underline underline-offset-2 hover:text-link-hover">
                          {row.subject}
                        </Link>
                      </TD>
                      <TD>
                        <SupportStateBadge state={supportState({ createdAt: row.created_at, firstResponseAt: row.first_response_at, closedAt: row.closed_at, now })} />
                      </TD>
                      <TD className="whitespace-nowrap text-muted">{formatDateTime(row.created_at)}</TD>
                    </TR>
                  ))
                )}
              </tbody>
            </Table>
          </Card>
          {open ? (
            <Card>
              <CardHeader title={`${open.reference}: ${open.subject}`} description={categoryLabel(open.category)} />
              <CardBody className="space-y-4">
                <Thread messages={data.messages} />
                {open.closed_at ? (
                  <p className="text-sm text-muted">This request is closed. Send a new request if you still need help.</p>
                ) : (
                  <ActionForm action={replyToSupportRequest} hidden={{ requestId: open.id }} submitLabel="Send message" pendingLabel="Sending">
                    <div>
                      <Label htmlFor="reply">Add a message</Label>
                      <Textarea id="reply" name="body" maxLength={4000} rows={4} />
                    </div>
                  </ActionForm>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
