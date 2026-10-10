import type { Certification } from "@/lib/rules/certify";
import type { Answers, BudgetLine } from "@/lib/rules/types";

type SnapshotAttachment = { path: string; filename: string; bytes: number; mime: string };

export type Snapshot = {
  formVersionId: string;
  answers: Answers;
  budget: Omit<BudgetLine, "rowId">[];
  attachments: SnapshotAttachment[];
  certification?: Certification;
};

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

export function buildSnapshot(input: {
  formVersionId: string;
  answers: Answers;
  budget: BudgetLine[];
  attachments: SnapshotAttachment[];
  certification?: Certification;
}): Snapshot {
  return sortKeys({
    formVersionId: input.formVersionId,
    answers: input.answers,
    budget: [...input.budget]
      .sort((a, b) => a.position - b.position)
      .map(({ position, category, description, amount, actual }) => ({
        position,
        category,
        description,
        amount,
        ...(actual === null || actual === undefined ? {} : { actual }),
      })),
    attachments: [...input.attachments].sort((a, b) => a.path.localeCompare(b.path)),
    ...(input.certification ? { certification: input.certification } : {}),
  }) as Snapshot;
}
