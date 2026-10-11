import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/status-badge";
import { ApplyToForms, type ApplyTarget } from "@/components/forms/apply-to-forms";
import { LibraryQuestionForm } from "@/components/forms/library-question-form";
import { LibraryRetire } from "@/components/forms/library-retire";
import { PROTECTED_KEYS, currentFiscalYear, loadLibraryQuestion, usageParts } from "@/lib/forms/library";
import { counted } from "@/lib/format";
import { formatDateTime, todayInNewYork } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Library question" };

export default async function LibraryQuestionPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const user = await requireUser(FINANCE_ROLES);
  const { key } = await params;
  const query = await searchParams;
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(key)) notFound();
  const admin = user.role === "finance_admin";
  const data = await withClaims(user.id, async (tx) => {
    const item = await loadLibraryQuestion(tx, key);
    if (!item) return null;
    const targets = admin
      ? await tx.query<{
          id: string;
          code: string;
          name: string;
          fiscal_year_id: string;
          status: string;
          has_form: boolean;
        }>(
          `SELECT i.id, i.code, i.name, i.fiscal_year_id, i.status,
                  EXISTS (SELECT 1 FROM form_version f WHERE f.initiative_id = i.id) AS has_form
           FROM initiative i ORDER BY i.code`,
        )
      : [];
    return { item, targets, year: await currentFiscalYear(tx, todayInNewYork()) };
  });
  if (!data) notFound();
  const { item, targets, year } = data;
  const usage = usageParts(item.usageByYear, year);
  const usageSentence = `Used by ${usage.current ? `${counted(usage.current.count, "initiative")} in ${usage.current.year}` : "no initiatives"}`;
  const priorUsage = usage.prior.map((p) => `${p.count} in ${p.year}`).join(", ");
  const retired = item.retiredAt !== null;
  const applyTargets: ApplyTarget[] = targets.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    fiscalYear: t.fiscal_year_id,
    retired: t.status === "retired",
    hasForm: t.has_form,
  }));

  return (
    <>
      <PageHeader
        title={item.question.label}
        crumbs={[
          { label: "Dashboard", href: "/finance" },
          { label: "Question library", href: "/finance/question-library" },
          { label: item.question.label },
        ]}
        meta={
          <>
            {retired ? <Badge>Retired</Badge> : <Badge tone="ok">Active</Badge>}
            <span className="text-[15px] text-ink-2">
              {usageSentence}
              {priorUsage ? <span className="text-muted"> ({priorUsage})</span> : null} · Last changed{" "}
              {formatDateTime(item.updatedAt)}
              {item.updatedBy ? ` by ${item.updatedBy}` : ""}
            </span>
          </>
        }
      />
      {query.added === "1" ? (
        <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-ok" role="status">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Question added to the library.
        </p>
      ) : null}
      {!admin ? (
        <p className="mb-4 rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink" role="note">
          Only finance administrators can change the question library. You can review this question here.
        </p>
      ) : null}
      <div className="max-w-[860px] space-y-6">
        <LibraryQuestionForm
          mode="update"
          initial={item.question}
          initialSection={item.templateSection}
          canEdit={admin}
          locked={retired}
        />
        {admin && !retired ? (
          <ApplyToForms questionKey={item.question.key} questionLabel={item.question.label} targets={applyTargets} />
        ) : null}
        {admin ? (
          <LibraryRetire
            questionKey={item.question.key}
            retired={retired}
            protectedQuestion={(PROTECTED_KEYS as readonly string[]).includes(item.question.key)}
          />
        ) : null}
      </div>
    </>
  );
}
