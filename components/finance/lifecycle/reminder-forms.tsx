"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mail, Plus, Save, Send } from "lucide-react";
import { deleteRule, restoreDefaults, saveRule, sendNow, toggleRule } from "@/app/finance/reminders/actions";
import { PLACEHOLDERS, sendNowSummary, type RuleRow } from "@/lib/lifecycle/reminders";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { FieldError, Hint, Input, Label, Select, Textarea } from "@/components/ui/field";
import { ErrorSummary, problemsTitle } from "@/components/ui/error-summary";
import { plural } from "@/lib/format";
import type { ActionState } from "@/lib/actions";

function Status({ state }: { state: ActionState }) {
  if (state?.error)
    return (
      <p role="alert" className="text-sm font-semibold text-bad">
        {state.error}
      </p>
    );
  if (state?.ok)
    return (
      <p role="status" className="text-sm font-semibold text-ok">
        {state.ok}
      </p>
    );
  return null;
}

export function RuleForm({ period, rule, cancelHref }: { period: string; rule?: RuleRow; cancelHref?: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveRule, undefined);
  const days = rule ? Math.abs(rule.offset_days) : 3;
  const timing = rule && rule.offset_days > 0 ? "after" : "before";
  const errors = state?.fieldErrors ?? {};
  const summary = Object.entries(errors).map(([key, message]) => ({ target: `rule-${key}`, message }));
  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.fieldErrors || state?.error) summaryRef.current?.focus();
  }, [state]);
  return (
    <form action={action} className="space-y-4" noValidate>
      <ErrorSummary
        ref={summaryRef}
        title={summary.length > 0 ? problemsTitle(summary.length, "you save") : "The rule was not saved"}
        items={summary.length > 0 ? summary : state?.error ? [{ message: state.error }] : []}
        className="mb-0"
      />
      <input type="hidden" name="period" value={period} />
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="rule-days">Days</Label>
          <Input
            id="rule-days"
            aria-required="true"
            name="days"
            type="number"
            min={0}
            max={365}
            defaultValue={days}
            aria-invalid={Boolean(errors.days)}
            aria-describedby={errors.days ? "rule-days-error" : undefined}
          />
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
        <Label htmlFor="rule-subject">Subject</Label>
        <Input
          id="rule-subject"
          aria-required="true"
          name="subject"
          defaultValue={rule?.template_subject ?? ""}
          aria-invalid={Boolean(errors.subject)}
          aria-describedby={errors.subject ? "rule-subject-error" : undefined}
        />
        <FieldError id="rule-subject-error">{errors.subject}</FieldError>
      </div>
      <div>
        <Label htmlFor="rule-body">Message</Label>
        <Hint id="rule-body-hint">Placeholders you can use: {PLACEHOLDERS.join(", ")}.</Hint>
        <Textarea
          id="rule-body"
          aria-required="true"
          name="body"
          rows={7}
          defaultValue={rule?.template_body ?? ""}
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? "rule-body-error rule-body-hint" : "rule-body-hint"}
        />
        <FieldError id="rule-body-error">{errors.body}</FieldError>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={rule?.active ?? true}
          className="h-4 w-4 rounded border-line"
        />
        Rule is on
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {rule ? <Save className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {pending ? "Saving" : rule ? "Save rule" : "Add rule"}
        </Button>
        {cancelHref ? (
          <Link
            href={cancelHref}
            className="text-sm font-semibold text-link underline underline-offset-2 hover:text-link-hover"
          >
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export function RuleActions({ rule, editHref }: { rule: RuleRow; editHref: string }) {
  const [toggleState, toggle, toggling] = useActionState<ActionState, FormData>(toggleRule, undefined);
  const [deleteState, remove, deleting] = useActionState<ActionState, FormData>(deleteRule, undefined);
  return (
    <div>
      <div className="flex flex-nowrap items-center gap-1.5">
        <Link href={editHref} className={compact}>
          Edit
        </Link>
        <form action={toggle}>
          <input type="hidden" name="id" value={rule.id} />
          <input type="hidden" name="active" value={rule.active ? "false" : "true"} />
          <button type="submit" disabled={toggling} className={compact}>
            {rule.active ? "Turn off" : "Turn on"}
          </button>
        </form>
        <form action={remove}>
          <input type="hidden" name="id" value={rule.id} />
          <button
            type="submit"
            disabled={deleting}
            aria-label={`Delete the rule for ${rule.offset_days} days`}
            className={cn(compact, "text-bad shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:text-bad")}
          >
            Delete
          </button>
        </form>
      </div>
      <Status state={toggleState ?? deleteState} />
    </div>
  );
}

const compact = buttonClass(
  "secondary",
  "sm",
  "h-8 px-2.5 text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] text-ink hover:text-link hover:shadow-[inset_0_0_0_1px_var(--color-action)]",
);

export function SendNowForm({
  period,
  date,
  dateLabel,
  today,
  count,
  fresh,
  orgs,
}: {
  period: string;
  date: string;
  dateLabel: string;
  today: string;
  count: number;
  fresh: number;
  orgs: number;
}) {
  const isToday = date === today;
  const [state, action, pending] = useActionState<ActionState, FormData>(sendNow, undefined);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (state?.ok || state?.error) setConfirming(false);
  }, [state]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="date" value={date} />
      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirm adding reminders to the outbox"
          className="flex w-full flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-3 py-2"
        >
          <p className="text-sm font-semibold text-ink">
            {sendNowSummary(orgs, fresh, dateLabel)} Add them to the outbox?
          </p>
          <Button type="submit" disabled={pending}>
            <Send className="h-4 w-4" aria-hidden="true" />{" "}
            {pending ? "Adding" : `Yes, add for ${orgs} ${plural(orgs, "organization", "organizations")}`}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" disabled={fresh === 0 || !isToday} onClick={() => setConfirming(true)}>
          <Send className="h-4 w-4" aria-hidden="true" /> Add to outbox
        </Button>
      )}
      <span className="text-sm text-muted">
        <Mail className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
        {isToday
          ? `${fresh} of ${count} will be added to the outbox`
          : "Reminders can be added to the outbox for today only. This is a preview of another date."}
      </span>
      <Status state={state} />
    </form>
  );
}

export function RestoreDefaultsForm({ period }: { period: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(restoreDefaults, undefined);
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
