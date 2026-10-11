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
import { loadLibrary } from "@/lib/forms/library";
import { TEMPLATE_SECTIONS } from "@/lib/forms/standard";
import { counted } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Question library" };

export default async function QuestionLibraryPage() {
  const user = await requireUser(FINANCE_ROLES);
  const admin = user.role === "finance_admin";
  const items = await withClaims(user.id, (tx) => loadLibrary(tx, { includeRetired: true }));
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
        <Table density="compact">
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
              items.map(({ question, templateSection, formsUsing, retiredAt }) => (
                <TR key={question.key}>
                  <TD className="min-w-[16rem]">
                    <Link
                      href={`/finance/question-library/${question.key}`}
                      className="font-semibold text-link underline underline-offset-2 hover:text-link-hover"
                    >
                      {question.label}
                    </Link>
                    <span className="block font-mono text-[13px] text-muted">{question.key}</span>
                  </TD>
                  <TD className="whitespace-nowrap">{TYPE_LABEL[question.type]}</TD>
                  <TD>{question.required ? "Required" : "Optional"}</TD>
                  <TD>{sectionTitle(templateSection) ?? <span className="text-muted">Not included</span>}</TD>
                  <TD align="right">{counted(formsUsing, "initiative")}</TD>
                  <TD>{retiredAt ? <Badge>Retired</Badge> : <Badge tone="ok">Active</Badge>}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
