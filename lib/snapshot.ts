import type { Answers, BudgetLine } from "@/lib/rules/types";

export type SnapshotAttachment = { path: string; filename: string; bytes: number; mime: string };

export type Snapshot = {
  formVersionId: string;
  answers: Answers;
  budget: Omit<BudgetLine, "rowId">[];
  attachments: SnapshotAttachment[];
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
}): Snapshot {
  return sortKeys({
    formVersionId: input.formVersionId,
    answers: input.answers,
    budget: [...input.budget]
      .sort((a, b) => a.position - b.position)
      .map(({ position, category, description, amount }) => ({ position, category, description, amount })),
    attachments: [...input.attachments].sort((a, b) => a.path.localeCompare(b.path)),
  }) as Snapshot;
}
