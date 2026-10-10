import "server-only";
import type { Tx } from "@/lib/db";
import { loadAnswers, loadAttachments, loadBudget, loadReport, withOrgDefaults } from "@/lib/report/data";
import { issuesBySection, reportIssues } from "@/lib/report/issues";
import { blockingIssues } from "@/lib/rules/validate";

export type ReportProgress = { complete: number; total: number };

export async function reportProgress(tx: Tx, submissionId: string): Promise<ReportProgress | null> {
  const report = await loadReport(tx, submissionId);
  if (!report) return null;
  const { answers } = await loadAnswers(tx, submissionId);
  const budget = await loadBudget(tx, submissionId);
  const attachments = await loadAttachments(tx, submissionId);
  const { header, definition } = report;
  const issues = blockingIssues(
    reportIssues({
      definition,
      answers: withOrgDefaults(answers, header.orgName, header.ein),
      budget,
      awardAmount: header.awardAmount,
      orgEin: header.ein,
      orgName: header.orgName,
      period: { startsOn: header.startsOn, endsOn: header.endsOn },
    }),
  );
  const bySection = issuesBySection(definition, issues);
  const sectionsDone = definition.sections.filter((section) => (bySection[section.key]?.length ?? 0) === 0).length;
  return { complete: sectionsDone + (attachments.length > 0 ? 1 : 0), total: definition.sections.length + 2 };
}
