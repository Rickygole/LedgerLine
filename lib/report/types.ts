import type { Answers, BudgetLine, FormDefinition } from "@/lib/rules/types";

export type AttachmentItem = {
  id: string;
  filename: string;
  bytes: number;
  uploadedAt: string;
  uploadedByName: string | null;
};

export type ReportStatus = "draft" | "submitted" | "under_review" | "returned" | "accepted";

export type ReportHeader = {
  id: string;
  referenceNo: string;
  status: ReportStatus;
  revision: number;
  lockVersion: number;
  initiativeName: string;
  periodLabel: string;
  startsOn: string;
  endsOn: string;
  dueOn: string;
  awardAmount: number;
  orgName: string;
  ein: string;
  updatedAt: string;
  updatedByName: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
};

export type EditorPayload = {
  header: ReportHeader;
  definition: FormDefinition;
  answers: Answers;
  budget: BudgetLine[];
  attachments: AttachmentItem[];
  storage: "blob" | "local";
  resumeSection: string | null;
  hasProgress: boolean;
  currentUserName: string;
  currentUserTitle: string;
};

export type CertificationDraft = { accepted: boolean; name: string; title: string };

export type SaveInput = {
  submissionId: string;
  expectedLock: number;
  saveId: string;
  answers: Answers;
  budget: BudgetLine[];
};

export type SaveResult =
  | { status: "saved"; lockVersion: number; savedAt: string }
  | { status: "stale"; by: string | null; at: string }
  | { status: "locked"; message: string }
  | { status: "signed_out" }
  | { status: "error"; message: string };

export type SubmitResult =
  | { status: "blocked"; issues: { field: string; ruleId: string; message: string; severity: "block" | "warn" }[] }
  | { status: "stale"; by: string | null; at: string }
  | { status: "signed_out" }
  | { status: "error"; message: string };

export type UploadActionResult =
  | { status: "ok"; attachment: AttachmentItem }
  | { status: "rejected"; message: string }
  | { status: "signed_out" }
  | { status: "error"; message: string };

export type PrepareUploadResult =
  | { status: "ok"; pathname: string; signature: string; contentType: string }
  | { status: "rejected"; message: string }
  | { status: "signed_out" }
  | { status: "error"; message: string };
