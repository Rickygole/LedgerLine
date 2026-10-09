"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Mail, Plus, Save, Send } from "lucide-react";
import { deleteRule, restoreDefaults, saveRule, sendNow, toggleRule, type ReminderState } from "@/app/finance/reminders/actions";
import { PLACEHOLDERS, type RuleRow } from "@/lib/lifecycle/reminders";
import { Button } from "@/components/ui/button";
import { FieldError, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { ErrorSummary } from "@/components/finance/admin/error-summary";

function Status({ state }: { state: ReminderState }) {
  if (state?.error) return <p role="alert" className="text-sm font-semibold text-bad">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-sm font-semibold text-ok">{state.ok}</p>;
  return null;
}

export function RuleForm({ period, rule, cancelHref }: { period: string; rule?: RuleRow; cancelHref?: string }) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(saveRule, undefined);
  const days = rule ? Math.abs(rule.offset_days) : 3;
  const timing = rule && rule.offset_days > 0 ? "after" : "before";
  const errors = state?.fieldErrors ?? {};
  const summary = Object.entries(errors).map(([key, message]) => ({ id: `rule-${key}`, message }));
  return (
    <form action={action} className="space-y-4" noValidate>
      <ErrorSummary errors={summary} />
      {state?.error && summary.length === 0 ? <p role="alert" className="rounded-md border border-bad/30 bg-bad-bg px-3 py-2 text-sm text-bad">{state.error}</p> : null}
      <input type="hidden" name="period" value={period} />
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="rule-days" required>Days</Label>
          <Input id="rule-days" name="days" type="number" min={0} max={365} defaultValue={days} aria-invalid={Boolean(errors.days)} aria-describedby={errors.days ? "rule-days-error" : undefined} />
          <FieldError id="rule-days-error">{errors.days}</FieldError>
        </div>
        <div>
          <Label htmlFor="rule-timing">Timing</Label>
          <Select id="rule-timing" name="timing" defaultValue={timing}>
            <option value="before">Before the due date</option>
            <option value="after">After the due date</option>
          </Select>
          <Hint>Use 0 days for the day the report is due.</Hint>
        </div>
      </div>
      <div>
        <Label htmlFor="rule-subject" required>Subject</Label>
        <Input id="rule-subject" name="subject" defaultValue={rule?.template_subject ?? ""} aria-invalid={Boolean(errors.subject)} aria-describedby={errors.subject ? "rule-subject-error" : undefined} />
        <FieldError id="rule-subject-error">{errors.subject}</FieldError>
      </div>
      <div>
        <Label htmlFor="rule-body" required>Message</Label>
        <Hint id="rule-body-hint">Placeholders you can use: {PLACEHOLDERS.join(", ")}.</Hint>
        <Textarea id="rule-body" name="body" rows={7} defaultValue={rule?.template_body ?? ""} aria-invalid={Boolean(errors.body)} aria-describedby={errors.body ? "rule-body-error rule-body-hint" : "rule-body-hint"} />
        <FieldError id="rule-body-error">{errors.body}</FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} className="h-4 w-4 rounded border-line" />
        Rule is on
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {rule ? <Save className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {pending ? "Saving" : rule ? "Save rule" : "Add rule"}
        </Button>
        {cancelHref ? (
          <Link href={cancelHref} className="text-sm font-semibold text-navy-800 hover:underline">
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function RuleActions({ rule, editHref }: { rule: RuleRow; editHref: string }) {
  const [toggleState, toggle, toggling] = useActionState<ReminderState, FormData>(toggleRule, undefined);
  const [deleteState, remove, deleting] = useActionState<ReminderState, FormData>(deleteRule, undefined);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={editHref} className="text-sm font-semibold text-navy-800 hover:underline">
        Edit
      </Link>
      <form action={toggle}>
        <input type="hidden" name="id" value={rule.id} />
        <input type="hidden" name="active" value={rule.active ? "false" : "true"} />
        <Button type="submit" variant="ghost" size="sm" disabled={toggling}>
          {rule.active ? "Turn off" : "Turn on"}
        </Button>
      </form>
      <form action={remove}>
        <input type="hidden" name="id" value={rule.id} />
        <Button type="submit" variant="ghost" size="sm" disabled={deleting} aria-label={`Delete the rule for ${rule.offset_days} days`}>
          Delete
        </Button>
      </form>
      <Status state={toggleState ?? deleteState} />
    </div>
  );
}

export function SendNowForm({ period, date, count, fresh }: { period: string; date: string; count: number; fresh: number }) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(sendNow, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="date" value={date} />
      <Button type="submit" disabled={pending || fresh === 0}>
        <Send className="h-4 w-4" aria-hidden="true" /> {pending ? "Sending" : "Send now"}
      </Button>
      <span className="text-sm text-muted">
        <Mail className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
        {fresh} of {count} will be added to the outbox
      </span>
      <Status state={state} />
    </form>
  );
}

export function RestoreDefaultsForm({ period }: { period: string }) {
  const [state, action, pending] = useActionState<ReminderState, FormData>(restoreDefaults, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="period" value={period} />
      <Button type="submit" variant="secondary" disabled={pending}>
        Add the standard schedule
      </Button>
      <Status state={state} />
    </form>
  );
}
