import type { Bucket } from "@/lib/reporting";
import type { Answers, BudgetLine, FormDefinition, Issue } from "@/lib/rules/types";

export type FlagReason = "unbalanced" | "incomplete" | "missing" | "validation" | "zero_outcomes" | "low_outcomes" | "manual";

export type RowFlag = { reason: FlagReason; evidence: string };

export type OpenFlag = { id: string; kind: string; note: string | null };

export type PeriodInfo = { id: string; label: string; dueOn: string; fiscalYearId: string };

export type ReportRow = {
  assignmentId: string;
  orgId: string;
  orgName: string;
  ein: string;
  borough: string;
  initiativeId: string;
  initiativeName: string;
  initiativeCode: string;
  category: string;
  award: number;
  periodId: string;
  dueOn: string;
  submissionId: string | null;
  referenceNo: string | null;
  status: string | null;
  revision: number;
  lockVersion: number;
  submittedAt: string | null;
  updatedAt: string | null;
  formVersionId: string | null;
  answers: Answers;
  budget: BudgetLine[];
  definition: FormDefinition | null;
  issues: Issue[];
  openFlags: OpenFlag[];
  bucket: Bucket;
  daysPastDue: number;
  flags: RowFlag[];
};

export type Filters = {
  q: string;
  initiative: string;
  category: string;
  borough: string;
  period: string;
  bucket: string;
  status: string;
  flag: string;
  page: number;
};
