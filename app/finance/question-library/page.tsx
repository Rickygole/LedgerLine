import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FINANCE_ROLES, requireUser } from "@/lib/auth";
import { withClaims } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-badge";
import { Table, THead, TH, TR, TD, EmptyRow } from "@/components/ui/table";
import { TYPE_LABEL } from "@/lib/forms/editor/definition";
import { currentFiscalYear, loadLibrary, usageParts } from "@/lib/forms/library";
import { TEMPLATE_SECTIONS } from "@/lib/forms/standard";
import { todayInNewYork } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Question library" };

export default async function QuestionLibraryPage() {
  const user = await requireUser(FINANCE_ROLES);
  const admin = user.role === "finance_admin";
  const { items, year } = await withClaims(user.id, async (tx) => ({
    items: await loadLibrary(tx, { includeRetired: true }),
    year: await currentFiscalYear(tx, todayInNewYork()),
  }));
  const sectionTitle = (key: string | null) => TEMPLATE_SECTIONS.find((s) => s.key === key)?.title ?? null;

  return (
    <>
      <PageHeader
        title="Question library"
        description={
          admin
            ? "The reporting questions shared by every initiative. Change a question here once, then apply it to the forms that should use the new wording."
            : "The reporting questions shared by every initiative. Only Finance administrators can change the library."
        }
        crumbs={[{ label: "Dashboard", href: "/finance" }, { label: "Question library" }]}
        actions={
          admin ? (
            <ButtonLink href="/finance/question-library/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a question
            </ButtonLink>
          ) : null
        }
      />
      <Card>
        <Table density="compact" stack>
          <THead>
            <tr>
              <TH>Question</TH>
              <TH>Answer type</TH>
              <TH>Required</TH>
              <TH>In new forms</TH>
              <TH align="right">Initiatives using it</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <tbody>
            {items.length === 0 ? (
              <EmptyRow colSpan={6}>The library has no questions yet.</EmptyRow>
            ) : (
              items.map(({ question, templateSection, usageByYear, retiredAt }) => {
                const usage = usageParts(usageByYear, year);
                return (
                  <TR key={question.key}>
                    <TD className="min-w-[16rem]" primary>
                      <Link
                        href={`/finance/question-library/${question.key}`}
                        className="font-semibold text-link underline-offset-2 hover:text-link-hover hover:underline"
                      >
                        {question.label}
                      </Link>
                      <span className="block whitespace-nowrap font-mono text-xs font-normal text-muted">
                        {question.key}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap" label="Answer type">
                      <span>{TYPE_LABEL[question.type]}</span>
                    </TD>
                    <TD label="Required">
                      <span>{question.required ? "Required" : "Optional"}</span>
                    </TD>
                    <TD label="In new forms">
                      <span>{sectionTitle(templateSection) ?? <span className="text-muted">Not included</span>}</span>
                    </TD>
                    <TD align="right" label="Initiatives using it">
                      <span>
                        {usage.current ? (
                          <span className="whitespace-nowrap">
                            {usage.current.count} in {usage.current.year}
                          </span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                        {usage.prior.map((p) => (
                          <span key={p.year} className="block whitespace-nowrap text-[13px] text-muted">
                            {p.count} in {p.year}
                          </span>
                        ))}
                      </span>
                    </TD>
                    <TD label="Status">
                      <span>{retiredAt ? <Badge>Retired</Badge> : <Badge tone="ok">Active</Badge>}</span>
                    </TD>
                  </TR>
                );
              })
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
