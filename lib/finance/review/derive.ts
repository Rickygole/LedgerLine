import { CITYWIDE } from "@/lib/domain";
import { bucketFor, type Bucket } from "@/lib/reporting";
import { daysPastDue } from "@/lib/dates";
import { formatCurrency, plural } from "@/lib/format";
import { balanceMessage, blockingIssues, budgetTotals, validateSubmission, visibleAnswers } from "@/lib/rules/validate";
import type { Answers, BudgetLine, FormDefinition, Issue } from "@/lib/rules/types";
import { matchesDistrict } from "@/lib/finance/district-stats";
import { PAGE_SIZE } from "./filters";
import type { Filters, FlagReason, OpenFlag, ReportRow, RowFlag } from "./types";
import { isUuid } from "@/lib/ids";

export const BUCKET_ORDER: Bucket[] = ["outstanding", "missing", "submitted", "in_review", "returned", "accepted"];

const SUBMITTED_STATUSES = ["submitted", "under_review", "returned", "accepted"];

function isSubmittedStatus(status: string | null): boolean {
  return status !== null && SUBMITTED_STATUSES.includes(status);
}

const EXPORT_STATUSES = ["submitted", "under_review", "accepted"];

export function isExportable(status: string | null): boolean {
  return status !== null && EXPORT_STATUSES.includes(status);
}

export function numberAnswer(answers: Answers, key: string): number | null {
  const value = answers[key];
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function computeIssues(
  definition: FormDefinition | null,
  answers: Answers,
  budget: BudgetLine[],
  award: number,
): Issue[] {
  if (!definition) return [];
  return blockingIssues(validateSubmission({ definition, answers, budget, awardAmount: award }));
}

export function outcomeFlag(status: string | null, stored: Answers, definition: FormDefinition | null): RowFlag | null {
  if (status === null || status === "draft" || status === "returned") return null;
  const answers = definition ? visibleAnswers(definition, stored) : stored;
  const actual = numberAnswer(answers, "participants_actual");
  const target = numberAnswer(answers, "participants_target");
  if (actual === null) return null;
  if (actual === 0) {
    return {
      reason: "zero_outcomes",
      evidence: target ? `Participants served 0 of ${target} targeted` : "Participants served 0",
    };
  }
  if (target && target > 0 && actual < target * 0.4) {
    return {
      reason: "low_outcomes",
      evidence: `Participants served ${actual} of ${target} targeted (${Math.round((actual / target) * 100)}%, below 40%)`,
    };
  }
  return null;
}

const KIND_TO_REASON: Record<string, FlagReason> = {
  unbalanced: "unbalanced",
  incomplete: "incomplete",
  validation: "validation",
  zero_outcomes: "zero_outcomes",
  manual: "manual",
  spend_spike: "manual",
};

function flagsForRow(input: {
  status: string | null;
  bucket: Bucket;
  daysPastDue: number;
  award: number;
  budget: BudgetLine[];
  answers: Answers;
  definition: FormDefinition | null;
  issues: Issue[];
  openFlags: OpenFlag[];
}): RowFlag[] {
  const flags: RowFlag[] = [];
  const { status } = input;
  const isOpenDraft = status === "draft" || status === "returned";

  if (isOpenDraft && input.budget.length > 0) {
    const { total } = budgetTotals(input.budget);
    const balance = balanceMessage(total, input.award);
    if (!balance.balanced) {
      const diff = Math.round((total - input.award) * 100) / 100;
      flags.push({
        reason: "unbalanced",
        evidence: `Budget total ${formatCurrency(total)} is ${formatCurrency(Math.abs(diff))} ${diff > 0 ? "over" : "under"} the ${formatCurrency(input.award)} award.`,
      });
    }
  }

  if ((status === "draft" || status === "returned") && input.daysPastDue > 0 && input.issues.length > 0) {
    const shown = input.issues.slice(0, 2).map((issue) => issue.message.replace(/\.$/, ""));
    const more = input.issues.length - shown.length;
    flags.push({
      reason: "incomplete",
      evidence: `${input.issues.length} required ${plural(input.issues.length, "item", "items")} failing, ${input.daysPastDue} days past due: ${shown.join("; ")}${more > 0 ? `; and ${more} more` : ""}`,
    });
  }

  if (input.bucket === "missing") {
    const state = status === null ? "Not started" : "Draft saved but not submitted";
    flags.push({
      reason: "missing",
      evidence: `${state}, ${input.daysPastDue} ${plural(input.daysPastDue, "day", "days")} past due`,
    });
  }

  if (status === "submitted" || status === "under_review" || status === "accepted") {
    if (input.issues.length > 0) {
      const shown = input.issues.slice(0, 2).map((issue) => issue.message.replace(/\.$/, ""));
      flags.push({
        reason: "validation",
        evidence: `${input.issues.length} ${plural(input.issues.length, "rule fails", "rules fail")}: ${shown.join("; ")}`,
      });
    }
  }

  const outcome = outcomeFlag(status, input.answers, input.definition);
  if (outcome) flags.push(outcome);

  for (const open of input.openFlags) {
    const reason = KIND_TO_REASON[open.kind] ?? "manual";
    const note = open.note?.trim() ? `Flagged by Finance: ${open.note.trim()}` : "Flagged by Finance";
    const existing = flags.find((f) => f.reason === reason);
    if (existing) existing.evidence = `${existing.evidence.replace(/\.$/, "")}. ${note}`;
    else flags.push({ reason, evidence: note });
  }

  return flags;
}

export function finishRow(base: Omit<ReportRow, "issues" | "bucket" | "daysPastDue" | "flags">): ReportRow {
  const issues = computeIssues(base.definition, base.answers, base.budget, base.award);
  const late = daysPastDue(base.dueOn);
  const bucket = bucketFor(base.status, base.dueOn);
  const flags = flagsForRow({
    status: base.status,
    bucket,
    daysPastDue: late,
    award: base.award,
    budget: base.budget,
    answers: base.answers,
    definition: base.definition,
    issues,
    openFlags: base.openFlags,
  });
  return { ...base, issues, bucket, daysPastDue: late, flags };
}

export function countBuckets(rows: Pick<ReportRow, "bucket">[]): Record<Bucket, number> {
  const counts = Object.fromEntries(BUCKET_ORDER.map((b) => [b, 0])) as Record<Bucket, number>;
  for (const row of rows) counts[row.bucket] += 1;
  return counts;
}

function statusKey(row: Pick<ReportRow, "status">): string {
  return row.status ?? "not_started";
}

export function applyFilters(rows: ReportRow[], filters: Partial<Filters>, skip: (keyof Filters)[] = []): ReportRow[] {
  const use = (key: keyof Filters) => !skip.includes(key) && Boolean(filters[key]);
  const q = (filters.q ?? "").toLowerCase();
  const einQuery = q.replace(/[^0-9]/g, "");
  const einLike = /^[0-9-]+$/.test(q);
  const initiative = (filters.initiative ?? "").toLowerCase();
  return rows.filter((row) => {
    if (use("q")) {
      const text = [row.orgName, row.initiativeName, row.initiativeCode, row.referenceNo, row.contractNumber].some(
        (value) => (value ?? "").toLowerCase().includes(q),
      );
      const einMatch = einLike && einQuery.length >= 2 && row.ein.replace(/[^0-9]/g, "").includes(einQuery);
      if (!text && !einMatch) return false;
    }
    if (use("initiative")) {
      if (isUuid(initiative)) {
        if (row.initiativeId.toLowerCase() !== initiative) return false;
      } else if (
        !row.initiativeName.toLowerCase().includes(initiative) &&
        !row.initiativeCode.toLowerCase().includes(initiative)
      )
        return false;
    }
    if (use("category") && row.category !== filters.category) return false;
    if (
      use("borough") &&
      !(filters.borough === CITYWIDE ? row.fundingSource === "citywide" : row.borough === filters.borough)
    )
      return false;
    if (use("district") && !matchesDistrict(row, filters.district!, filters.by ?? "")) return false;
    if (use("member") && !row.sponsors.some((s) => String(s.district) === filters.member)) return false;
    if (use("funding") && row.fundingSource !== filters.funding) return false;
    if (use("contract") && row.contractStatus !== filters.contract) return false;
    if (use("agency") && row.agency !== filters.agency) return false;
    if (use("orgType") && row.orgType !== filters.orgType) return false;
    if (use("awardMin") && row.award < Number(filters.awardMin)) return false;
    if (use("awardMax") && row.award > Number(filters.awardMax)) return false;
    if (use("bucket") && row.bucket !== filters.bucket) return false;
    if (use("status") && statusKey(row) !== filters.status) return false;
    if (use("flag")) {
      if (filters.flag === "any") {
        if (row.flags.length === 0) return false;
      } else if (!row.flags.some((flag) => flag.reason === filters.flag)) return false;
    }
    return true;
  });
}

export function paginate<T>(items: T[], page: number, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: current,
    pages,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(items.length, start + size),
  };
}

export function sortRows(rows: ReportRow[]): ReportRow[] {
  return [...rows].sort(
    (a, b) => a.orgName.localeCompare(b.orgName) || a.initiativeName.localeCompare(b.initiativeName),
  );
}

const URGENCY: Record<Bucket, number> = {
  missing: 0,
  submitted: 1,
  returned: 2,
  in_review: 3,
  outstanding: 4,
  accepted: 5,
};

export function sortByUrgency(rows: ReportRow[]): ReportRow[] {
  return [...rows].sort(
    (a, b) =>
      URGENCY[a.bucket] - URGENCY[b.bucket] ||
      a.dueOn.localeCompare(b.dueOn) ||
      (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "") ||
      b.award - a.award ||
      a.orgName.localeCompare(b.orgName),
  );
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

export function boroughSeries(rows: ReportRow[]) {
  const grouped = groupBy(rows, (r) => r.borough);
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([borough, list]) => ({ borough, ...countBuckets(list) }));
}

export function completionByCategory(rows: ReportRow[]) {
  const grouped = groupBy(rows, (r) => r.category);
  return [...grouped.entries()]
    .map(([category, list]) => {
      const done = list.filter((r) => isSubmittedStatus(r.status)).length;
      return {
        category,
        expected: list.length,
        submitted: done,
        rate: list.length === 0 ? 0 : Math.round((done / list.length) * 1000) / 10,
      };
    })
    .sort((a, b) => b.rate - a.rate || a.category.localeCompare(b.category));
}
