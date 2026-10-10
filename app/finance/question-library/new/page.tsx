import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { LibraryQuestionForm } from "@/components/forms/library-question-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add a library question" };

export default async function NewLibraryQuestionPage() {
  await requireUser(["finance_admin"]);
  return (
    <>
      <PageHeader
        title="Add a library question"
        crumbs={[
          { label: "Dashboard", href: "/finance" },
          { label: "Question library", href: "/finance/question-library" },
          { label: "Add a question" },
        ]}
      />
      <div className="max-w-[860px]">
        <LibraryQuestionForm mode="create" initial={null} initialSection={null} canEdit />
      </div>
    </>
  );
}
