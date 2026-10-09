const LABELS: Record<string, string> = {
  submission_confirmation: "Submission confirmation",
  return_notice: "Update requested",
  acceptance_notice: "Report accepted",
};

export function templateLabel(template: string): string {
  return LABELS[template] ?? template.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
