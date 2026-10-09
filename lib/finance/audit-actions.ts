export type ActionWords = {
  label: string;
  alone: string;
  verb: string;
};

export const AUDIT_ACTIONS: Record<string, ActionWords> = {
  start: { label: "Report started", alone: "started the report", verb: "started" },
  submit: { label: "Report submitted", alone: "submitted the report", verb: "submitted" },
  start_review: { label: "Review started", alone: "started review", verb: "started review of" },
  request_update: { label: "Update requested", alone: "requested an update", verb: "requested an update on" },
  accept: { label: "Report accepted", alone: "accepted the report", verb: "accepted" },
  reopen: { label: "Report reopened", alone: "reopened the report", verb: "reopened" },
  correction: { label: "Answer corrected", alone: "corrected an answer", verb: "corrected an answer on" },
  flag_add: { label: "Flag added", alone: "added a flag", verb: "added a flag to" },
  flag_resolve: { label: "Flag resolved", alone: "resolved a flag", verb: "resolved a flag on" },
  flag_dismiss: { label: "Flag dismissed", alone: "dismissed a flag", verb: "dismissed a flag on" },
  attachment_removed: { label: "Attachment removed", alone: "removed an attachment", verb: "removed an attachment from" },
  publish: { label: "Form published", alone: "published a form version", verb: "published" },
  create_draft: { label: "Form draft created", alone: "created a form draft", verb: "created a draft of" },
  form_edit: { label: "Form draft edited", alone: "edited a form draft", verb: "edited" },
  ai_draft_applied: { label: "AI suggestions applied", alone: "applied AI suggested questions", verb: "applied AI suggested questions to" },
  ai_draft_discarded: { label: "AI suggestions discarded", alone: "discarded AI suggested questions", verb: "discarded AI suggested questions for" },
  create: { label: "Created", alone: "created a record", verb: "created" },
  update: { label: "Updated", alone: "updated a record", verb: "updated" },
  delete: { label: "Deleted", alone: "deleted a record", verb: "deleted" },
  activate: { label: "Turned on or activated", alone: "activated a record", verb: "activated" },
  deactivate: { label: "Turned off or deactivated", alone: "deactivated a record", verb: "deactivated" },
  assign: { label: "Award added", alone: "added an award", verb: "added an award for" },
  funding_recalculated: { label: "Funding recalculated", alone: "recalculated initiative funding", verb: "recalculated funding for" },
  rollover: { label: "Fiscal year rolled over", alone: "rolled over the fiscal year", verb: "rolled over to" },
  rollover_carry: { label: "Initiative carried forward", alone: "carried an initiative forward", verb: "carried forward" },
  rollover_rename: { label: "Initiative renamed at rollover", alone: "renamed an initiative at rollover", verb: "carried forward and renamed" },
  rollover_retire: { label: "Initiative retired at rollover", alone: "retired an initiative at rollover", verb: "retired" },
  rollover_combine: { label: "Initiatives combined at rollover", alone: "combined initiatives at rollover", verb: "combined initiatives into" },
  user_create: { label: "Account created", alone: "created an account", verb: "created an account for" },
  role_change: { label: "Role changed", alone: "changed a role", verb: "changed the role of" },
  password_set: { label: "Password set", alone: "set a password", verb: "set a password for" },
  password_reset_requested: { label: "Password reset queued", alone: "queued a password reset", verb: "queued a password reset for" },
  sign_in: { label: "Signed in", alone: "signed in", verb: "signed in" },
  sign_out: { label: "Signed out", alone: "signed out", verb: "signed out" },
  reminders_queued: { label: "Reminders queued", alone: "queued reminders", verb: "queued reminders for" },
  reminder_defaults_restored: { label: "Standard reminders added", alone: "added the standard reminder schedule", verb: "added the standard reminder schedule for" },
  export: { label: "Submissions exported", alone: "exported submissions", verb: "exported" },
};

export const ENTITY_LABELS: Record<string, string> = {
  submission: "Report",
  initiative: "Initiative",
  form_version: "Form version",
  app_user: "User account",
  user: "Sign in",
  organization: "Organization",
  assignment: "Award",
  reporting_period: "Reporting period",
  fiscal_year: "Fiscal year",
  reminder_rule: "Reminder rule",
  export: "Export",
};

function humanize(text: string): string {
  const words = text.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function actionLabel(action: string): string {
  return AUDIT_ACTIONS[action]?.label ?? humanize(action);
}

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? humanize(entity);
}

export function actionInWords(action: string): string {
  return AUDIT_ACTIONS[action]?.alone ?? `recorded ${humanize(action).toLowerCase()}`;
}

export function actionVerb(action: string): string {
  return AUDIT_ACTIONS[action]?.verb ?? `recorded ${humanize(action).toLowerCase()} on`;
}
