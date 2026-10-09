const PHRASES: Record<string, string> = {
  submit: "submitted the report",
  sign_in: "signed in",
  sign_out: "signed out",
  start_review: "started review",
  request_update: "requested an update",
  accept: "accepted the report",
  reopen: "reopened the report",
  correction: "corrected an answer",
  flag_add: "added a flag",
  flag_resolve: "resolved a flag",
  flag_dismiss: "dismissed a flag",
  export: "exported submissions",
  publish: "published a form version",
};

export const QUIET_ACTIONS = ["sign_in", "sign_out", "reminder_defaults_restored", "reminders_queued", "password_reset_requested", "export"];

export function actionInWords(action: string): string {
  return PHRASES[action] ?? action.replace(/_/g, " ");
}

const STATUS_WORDS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "In review",
  returned: "Update requested",
  accepted: "Accepted",
};

export function statusInWords(status: unknown): string {
  return typeof status === "string" ? (STATUS_WORDS[status] ?? status) : "";
}
