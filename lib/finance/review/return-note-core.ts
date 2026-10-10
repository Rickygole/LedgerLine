import { formatCurrency } from "@/lib/format";
import { balanceMessage, budgetTotals } from "@/lib/rules/validate";
import type { BudgetLine, FormDefinition, Issue } from "@/lib/rules/types";
import { FLAG_LABEL } from "./filters";
import { outcomeFlag } from "./derive";
import type { OpenFlag } from "./types";
import type { Answers } from "@/lib/rules/types";

export type Concern = {
  id: string;
  ruleId: string;
  kind: "rule" | "flag" | "preset" | "outcome";
  label: string;
  detail: string | null;
};

export type NoteSentence = { text: string; ruleIds: string[] };

export const PRESET_CONCERNS: Concern[] = [
  {
    id: "PR-001:docs",
    ruleId: "PR-001",
    kind: "preset",
    label: "Attach supporting documentation for personnel lines",
    detail: null,
  },
  { id: "PR-002:counts", ruleId: "PR-002", kind: "preset", label: "Confirm participant counts", detail: null },
];

const RULE_ID_PATTERN = /\b[A-Z]{2}-\d{2,3}\b/;
const DOLLAR_PATTERN = /\$[\d,]+(?:\.\d{1,2})?/g;

function redactContactDetails(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email removed]")
    .replace(/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, "[phone removed]")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsRuleId(text: string): boolean {
  return RULE_ID_PATTERN.test(text);
}

export function dollarFigures(text: string): string[] {
  return (text.match(DOLLAR_PATTERN) ?? []).map((figure) => figure.replace(/[.,]$/, ""));
}

function labelFor(definition: FormDefinition | null, field: string): string {
  if (field === "budget") return "Budget";
  if (field.startsWith("budget.")) return "Budget line";
  for (const section of definition?.sections ?? []) {
    const question = section.questions.find((q) => q.key === field);
    if (question) return question.label;
  }
  return field.replace(/_/g, " ");
}

export function buildConcerns(input: {
  definition: FormDefinition | null;
  issues: Issue[];
  budget: BudgetLine[];
  award: number;
  status: string | null;
  answers: Answers;
  openFlags: OpenFlag[];
}): Concern[] {
  const concerns: Concern[] = [];
  const seen = new Set<string>();
  for (const issue of input.issues) {
    const field = issue.field.startsWith("budget.") ? "budget.lines" : issue.field;
    const id = `${issue.ruleId}:${field}`;
    if (seen.has(id)) continue;
    seen.add(id);
    let detail: string | null = null;
    if (issue.field === "budget" && issue.message.startsWith("Total")) {
      const { total } = budgetTotals(input.budget);
      const balance = balanceMessage(total, input.award);
      if (!balance.balanced) detail = `Total ${formatCurrency(total)} vs award ${formatCurrency(input.award)}`;
    }
    concerns.push({
      id,
      ruleId: issue.ruleId,
      kind: "rule",
      label: field === "budget.lines" ? "Budget line descriptions" : labelFor(input.definition, issue.field),
      detail,
    });
  }
  const outcome = outcomeFlag(input.status === "draft" ? "submitted" : input.status, input.answers, input.definition);
  if (outcome) {
    const zero = outcome.reason === "zero_outcomes";
    concerns.push({
      id: `${zero ? "OC-001" : "OC-002"}:participants`,
      ruleId: zero ? "OC-001" : "OC-002",
      kind: "outcome",
      label: "Participants served",
      detail: outcome.evidence.replace(/^Participants served /, ""),
    });
  }
  for (const flag of input.openFlags) {
    const id = `FL-001:${flag.id}`;
    const kind = FLAG_LABEL[flag.kind === "spend_spike" ? "manual" : flag.kind] ?? "Flagged item";
    const cleaned = flag.note ? redactContactDetails(flag.note) : "";
    const note = cleaned === "" ? null : cleaned;
    concerns.push({ id, ruleId: "FL-001", kind: "flag", label: kind, detail: note });
  }
  return concerns;
}

function fallbackSentence(concern: Concern): string {
  const label = concern.label;
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  switch (concern.ruleId) {
    case "BR-021":
      return `Please provide ${lower}.`;
    case "BR-022":
      return concern.detail
        ? `Please correct the budget so the total equals the award (${concern.detail.replace("Total ", "total ").replace(" vs award ", " and award ")}).`
        : "Please correct the budget so the total equals the award.";
    case "BR-008":
      return "Please reduce the number of budget lines to the allowed maximum.";
    case "US-029":
      return `Please check the value entered for ${lower} and use the expected format.`;
    case "US-030":
      return `Please shorten ${lower} to fit the length limit.`;
    case "US-008":
      return `Please choose one of the listed options for ${lower}.`;
    case "BR-023":
      return "Please check the EIN and enter all nine digits.";
    case "OC-001":
    case "OC-002":
      return concern.detail
        ? `Please check the number of participants served: you reported ${concern.detail}.`
        : "Please check the number of participants served.";
    case "PR-001":
      return "Please attach supporting documentation for personnel lines.";
    case "PR-002":
      return "Please confirm the participant counts.";
    case "FL-001":
      return concern.label === FLAG_LABEL.manual
        ? "Council Finance has a question about this report. Please review it and respond."
        : `Council Finance has a question about this report (${lower}). Please review it and respond.`;
    default:
      return `Please review ${lower} and update it.`;
  }
}

type AiInput = { concerns: { rule_id: string; field: string; value: string | null }[] };

export function buildAiInput(concerns: Concern[]): AiInput {
  return {
    concerns: concerns.map((c) => ({ rule_id: c.ruleId, field: c.label, value: c.kind === "flag" ? null : c.detail })),
  };
}

export function validateSentences(
  raw: unknown,
  concerns: Concern[],
): { kept: NoteSentence[]; dropped: { text: string; reason: string }[] } {
  const allowedIds = new Set(concerns.map((c) => c.ruleId));
  const allowedDollars = new Set(
    concerns.flatMap((c) => dollarFigures(`${c.label} ${c.kind === "flag" ? "" : (c.detail ?? "")}`)),
  );
  const kept: NoteSentence[] = [];
  const dropped: { text: string; reason: string }[] = [];
  const list =
    raw && typeof raw === "object" && Array.isArray((raw as { sentences?: unknown }).sentences)
      ? ((raw as { sentences: unknown[] }).sentences as unknown[])
      : [];
  for (const item of list) {
    const entry = item as { text?: unknown; rule_ids?: unknown };
    const text = typeof entry?.text === "string" ? entry.text.trim() : "";
    const ids = Array.isArray(entry?.rule_ids)
      ? entry.rule_ids.filter((id): id is string => typeof id === "string")
      : [];
    if (!text) {
      dropped.push({ text: "", reason: "empty sentence" });
      continue;
    }
    if (ids.length === 0) {
      dropped.push({ text, reason: "cites no rule" });
      continue;
    }
    if (ids.some((id) => !allowedIds.has(id))) {
      dropped.push({ text, reason: "cites a rule that was not in the input" });
      continue;
    }
    if (containsRuleId(text)) {
      dropped.push({ text, reason: "shows a rule id to the organization" });
      continue;
    }
    if (dollarFigures(text).some((figure) => !allowedDollars.has(figure))) {
      dropped.push({ text, reason: "contains a dollar figure that was not in the input" });
      continue;
    }
    kept.push({ text, ruleIds: [...new Set(ids)] });
  }
  return { kept, dropped };
}

export function completeSentences(
  kept: NoteSentence[],
  concerns: Concern[],
): { sentences: NoteSentence[]; filled: number } {
  const covered = new Set(kept.flatMap((s) => s.ruleIds));
  const sentences = [...kept];
  let filled = 0;
  const seen = new Set<string>();
  for (const concern of concerns) {
    if (covered.has(concern.ruleId)) continue;
    const text = fallbackSentence(concern);
    if (seen.has(text)) continue;
    seen.add(text);
    sentences.push({ text, ruleIds: [concern.ruleId] });
    filled += 1;
  }
  return { sentences, filled };
}

export function templateSentences(concerns: Concern[]): NoteSentence[] {
  return completeSentences([], concerns).sentences;
}

export function noteText(sentences: NoteSentence[]): string {
  return sentences.map((s) => s.text).join("\n");
}

export function lineDiff(before: string, after: string) {
  const a = before
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const b = after
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return { removed: a.filter((l) => !b.includes(l)), added: b.filter((l) => !a.includes(l)) };
}
